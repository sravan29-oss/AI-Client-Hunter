import { randomUUID } from 'node:crypto';
import { prisma, isDatabaseConnected, memoryStore } from '../db/prisma';
import { dailyReportService } from './dailyReportService';
import { notificationService } from './notificationService';
import { emptyDiscoveryResult, runDiscoveryCycle } from './discovery/discoveryCycle';
import { discoveryJobs, type DiscoveryTrigger, type DiscoveryJob, type DiscoveryResult } from './discovery/discoveryJobs';
import { calculateNextRun, isValidTimeZone, selectSegment } from './discovery/discoverySchedule';
import { logger } from '../utils/logger';
import { getActiveIdealProfile, type SavedIdealProfile } from './idealClientProfiles';
import { manualProfileSegment, profileSchedules } from './discovery/profileSchedule';
import { BadRequestError } from '../utils/errors';
import { config as environment } from '../config';

const executionLogFields = {
  id: true, status: true, triggerType: true, providerUsed: true, country: true, city: true, industry: true,
  discoveredCount: true, qualifiedCount: true, duplicatesCount: true, websitesAuditedCount: true,
  errorDetails: true, startedAt: true, completedAt: true, durationMs: true, createdAt: true,
  profileSnapshot: true, qualificationMetrics: true,
} as const;

export interface SchedulerConfig {
  id?: string;
  enabled: boolean;
  scheduleMode: 'DAILY' | 'WEEKLY' | 'MANUAL';
  scheduledTime: string; // HH:mm
  timezone: string;
  targetCountries: string[];
  targetCities: string[];
  targetIndustries: string[];
  minOpportunityScore: number;
  maxLeadsPerRun: number;
  preferredProvider: string;
  notifyInApp: boolean;
  notifyEmail: boolean;
  notifyTelegram: boolean;
  notificationEmail?: string | null;
  telegramChatId?: string | null;
  lastRunAt?: Date | null;
  lastRunStatus?: string | null;
  nextRunAt?: Date | null;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  enabled: false,
  scheduleMode: 'DAILY',
  scheduledTime: '09:00',
  timezone: 'Asia/Kolkata',
  targetCountries: ['India', 'United States', 'United Kingdom', 'Europe'],
  targetCities: ['Bengaluru', 'Mumbai', 'Delhi', 'New York', 'London'],
  targetIndustries: [
    'Restaurants',
    'Retail shops',
    'Healthcare',
    'Real estate',
    'Education',
    'E-commerce',
    'Travel',
    'Professional services',
    'Startups',
    'Local businesses',
  ],
  minOpportunityScore: 60,
  maxLeadsPerRun: 10,
  preferredProvider: 'overpass',
  notifyInApp: true,
  notifyEmail: false,
  notifyTelegram: false,
  notificationEmail: '',
  telegramChatId: '',
  lastRunAt: null,
  lastRunStatus: 'Never run',
  nextRunAt: null,
};

export class SchedulerService {
  private memoryRunning = false;
  private stopLocal = false;
  private ticking = false;
  private timer: NodeJS.Timeout | null = null;

  startScheduler() {
    if (this.timer) return;
    const tick = () => {
      void this.tick().catch((error) => logger.error('Discovery worker tick failed:', error));
    };
    this.timer = setInterval(tick, 5000);
    this.timer.unref();
    tick();
  }

  stopScheduler() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async getConfig(): Promise<SchedulerConfig> {
    if (isDatabaseConnected) {
      const row = await prisma.autoHunterConfig.findUnique({ where: { id: 'default' } })
        ?? await prisma.autoHunterConfig.upsert({
          where: { id: 'default' },
          create: { ...DEFAULT_CONFIG, id: 'default' },
          update: {},
        });
      return {
        ...row,
        scheduleMode: row.scheduleMode === 'MANUAL' || row.scheduleMode === 'WEEKLY' ? row.scheduleMode : 'DAILY',
        timezone: isValidTimeZone(row.timezone) ? row.timezone : DEFAULT_CONFIG.timezone,
      };
    }

    memoryStore.autoHunterConfig ??= { ...DEFAULT_CONFIG };
    return memoryStore.autoHunterConfig;
  }

  async updateConfig(changes: Partial<SchedulerConfig>): Promise<SchedulerConfig> {
    const current = await this.getConfig();
    const updated = { ...current, ...changes };
    const scheduleChanged = updated.enabled !== current.enabled || updated.timezone !== current.timezone
      || updated.scheduleMode !== current.scheduleMode || updated.scheduledTime !== current.scheduledTime;
    const data = scheduleChanged || (updated.enabled && !updated.nextRunAt)
      ? { ...changes, nextRunAt: calculateNextRun(updated) }
      : changes;
    if (isDatabaseConnected) {
      const row = await prisma.autoHunterConfig.update({ where: { id: 'default' }, data });
      return { ...row, scheduleMode: updated.scheduleMode };
    }
    memoryStore.autoHunterConfig = { ...current, ...data };
    return memoryStore.autoHunterConfig;
  }

  async queueManualRun(locationKey?: string) {
    const config = await this.getConfig();
    const profile = await getActiveIdealProfile();
    if (!profile && locationKey) throw new BadRequestError('Activate an Ideal Client Profile before choosing a target location.');
    if (isDatabaseConnected) {
      const count = profile ? await prisma.autoHunterLog.count({ where: {
        triggerType: 'MANUAL', profileSnapshot: { path: ['profileId'], equals: profile.id },
      } }) : await prisma.autoHunterLog.count();
      return discoveryJobs.enqueueManual(profile ? manualProfileSegment(profile, config, count, locationKey) : selectSegment(config, count));
    }
    if (this.memoryRunning) return undefined;
    const id = randomUUID();
    void this.executeMemoryRun(config, 'MANUAL', id).catch((error) => logger.error('Discovery run failed:', error));
    return id;
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const config = await this.getConfig();
      const profile = await getActiveIdealProfile();
      if (config.enabled && profile) {
        await discoveryJobs.enqueueProfileScheduled(config, profile);
      } else if (config.enabled && config.scheduleMode !== 'MANUAL') {
        if (!config.nextRunAt) {
          const nextRunAt = calculateNextRun(config);
          if (isDatabaseConnected) {
            await prisma.autoHunterConfig.updateMany({
              where: {
                id: 'default', nextRunAt: null, enabled: true,
                scheduleMode: config.scheduleMode, scheduledTime: config.scheduledTime, timezone: config.timezone,
              },
              data: { nextRunAt },
            });
          } else {
            memoryStore.autoHunterConfig.nextRunAt = nextRunAt;
          }
        } else if (config.nextRunAt.getTime() <= Date.now()) {
          const next = calculateNextRun(config, new Date(), config.nextRunAt);
          if (isDatabaseConnected) {
            const count = await prisma.autoHunterLog.count();
            await discoveryJobs.enqueueScheduled(selectSegment(config, count), config.nextRunAt, next);
          } else if (!this.memoryRunning) {
            memoryStore.autoHunterConfig.nextRunAt = next;
            await this.executeMemoryRun(config, 'SCHEDULED', randomUUID());
          }
        }
      }
      if (isDatabaseConnected) {
        const job = await discoveryJobs.claim();
        if (job) await this.executePersistentRun(config, job);
      }
    } finally {
      this.ticking = false;
    }
  }

  private async executePersistentRun(config: SchedulerConfig, job: DiscoveryJob) {
    this.stopLocal = false;
    const heartbeat = setInterval(() => {
      void discoveryJobs.renew(job).then((owned) => {
        if (!owned) this.stopLocal = true;
      }).catch((error) => {
        this.stopLocal = true;
        logger.error('Discovery worker heartbeat failed:', error);
      });
    }, 5000);
    heartbeat.unref();
    try {
      const profile = await getActiveIdealProfile();
      const valid = job.profileSnapshot ? profile?.id === job.profileSnapshot.profileId && profile.revision === job.profileSnapshot.revision : !profile;
      const result = valid
        ? await runDiscoveryCycle(config, job, () => !this.stopLocal, job)
        : { ...emptyDiscoveryResult(), status: 'STOPPED' as const, errorDetails: 'The targeting profile changed before discovery started.' };
      const completed = await discoveryJobs.finish(job, result);
      if (completed?.completedAt) {
        await this.recordCompletion(config, result, completed.status, completed.completedAt);
      }
    } catch (error) {
      const result: DiscoveryResult = {
        ...emptyDiscoveryResult(), status: 'FAILED',
        errorDetails: error instanceof Error ? error.message : String(error),
      };
      const completed = await discoveryJobs.finish(job, result);
      if (completed?.completedAt) await this.recordCompletion(config, result, completed.status, completed.completedAt);
      logger.error('Discovery run failed:', error);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async executeMemoryRun(config: SchedulerConfig, triggerType: DiscoveryTrigger, id: string) {
    this.memoryRunning = true;
    this.stopLocal = false;
    const startedAt = new Date();
    const segment = selectSegment(config, memoryStore.autoHunterLogs.length);
    const log = { id, ...segment, triggerType, createdAt: startedAt, startedAt, status: 'RUNNING' };
    memoryStore.autoHunterLogs.unshift(log);
    try {
      const result = await runDiscoveryCycle(config, segment, () => !this.stopLocal);
      const completedAt = new Date();
      Object.assign(log, result, { completedAt, durationMs: completedAt.getTime() - startedAt.getTime() });
      await this.recordCompletion(config, result, result.status, completedAt);
    } finally {
      this.memoryRunning = false;
      this.stopLocal = false;
    }
  }

  private async recordCompletion(config: SchedulerConfig, result: DiscoveryResult, status: string, time: Date) {
    const lastRunStatus = result.errorDetails
      ? `${status}: ${result.errorDetails}`
      : `${status}: ${result.discoveredCount} discovered, ${result.qualifiedCount} qualified, ${result.duplicatesCount} duplicates`;
    if (isDatabaseConnected) {
      await prisma.autoHunterConfig.updateMany({
        where: { id: 'default', OR: [{ lastRunAt: null }, { lastRunAt: { lte: time } }] },
        data: { lastRunAt: time, lastRunStatus },
      });
    } else {
      Object.assign(memoryStore.autoHunterConfig, { lastRunAt: time, lastRunStatus });
    }
    if (status === 'FAILED' && config.notifyInApp) {
      await notificationService.createInAppNotification({
        title: 'Discovery run failed',
        message: result.errorDetails || 'Open Auto Hunter to review the run history.',
        type: 'PROVIDER_ERROR',
      });
    }
    await dailyReportService.generateDailyReport(time);
  }

  stopCurrentRun() {
    if (!this.memoryRunning) return false;
    this.stopLocal = true;
    return true;
  }

  async requestStop() {
    return isDatabaseConnected ? discoveryJobs.requestStop() : this.stopCurrentRun();
  }

  async getStatus() {
    const config = await this.getConfig();
    const [unreadNotifications, currentRun, activeProfile] = await Promise.all([
      notificationService.getUnreadCount(),
      isDatabaseConnected ? prisma.autoHunterLog.findFirst({
        where: { status: { in: ['RUNNING', 'QUEUED'] }, availableAt: { not: null } }, select: executionLogFields,
      }) : null,
      getActiveIdealProfile(),
    ]);
    const jobStatus = currentRun?.status ?? (this.memoryRunning ? 'RUNNING' : null);
    const targets = activeProfile ? await this.describeActiveLocations(activeProfile, config) : null;
    const scheduled = targets?.flatMap((target) => target.nextRunAt ? [target.nextRunAt] : []) ?? [];
    const nextRunAt = !config.enabled ? null : activeProfile
      ? scheduled.sort((a, b) => +a - +b)[0] ?? null
      : config.nextRunAt ?? calculateNextRun(config);
    return {
      isRunning: jobStatus === 'RUNNING', jobStatus,
      enabled: config.enabled, scheduleMode: config.scheduleMode, scheduledTime: config.scheduledTime,
      timezone: config.timezone, preferredProvider: config.preferredProvider, lastRunAt: config.lastRunAt,
      lastRunStatus: config.lastRunStatus, nextRunAt,
      activeProfile: activeProfile ? { id: activeProfile.id, name: activeProfile.name, locations: targets } : null,
      unreadNotifications,
      currentRun,
      externalAlertsEnabled: environment.DISCOVERY_EXTERNAL_ALERTS_ENABLED,
    };
  }

  private async describeActiveLocations(profile: SavedIdealProfile, config: SchedulerConfig) {
    const saved = await prisma.profileScheduleCursor.findMany({ where: { profileId: profile.id } });
    const cursors = new Map(saved.map((cursor) => [cursor.locationKey, cursor]));
    return profileSchedules(profile, config).map(({ location, key, signature, schedule }) => {
      const cursor = cursors.get(key);
      const nextRunAt = !config.enabled ? null : cursor?.signature === signature ? cursor.nextRunAt : calculateNextRun(schedule);
      return { key, country: location.country, city: location.city, nextRunAt, timezone: schedule.timezone, mode: schedule.scheduleMode };
    });
  }

  async getExecutionLogs(limit = 30) {
    if (isDatabaseConnected) {
      return prisma.autoHunterLog.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: executionLogFields,
      });
    }
    return memoryStore.autoHunterLogs.slice(0, limit);
  }
}

export const schedulerService = new SchedulerService();
