import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import type { DiscoverySegment } from './discoverySchedule';
import { calculateNextRun } from './discoverySchedule';
import { getActiveIdealProfile, profileIsCurrent, type SavedIdealProfile } from '../idealClientProfiles';
import type { SchedulerConfig } from '../schedulerService';
import { profileSchedules, profileSegment } from './profileSchedule';
import { profileSnapshotSchema } from '../idealProfileTypes';

const LEASE_MS = 90000;
const MAX_ATTEMPTS = 3;
export type DiscoveryTrigger = 'MANUAL' | 'SCHEDULED';

export interface DiscoveryJob extends DiscoverySegment {
  id: string;
  leaseToken: string;
  triggerType: DiscoveryTrigger;
  attempts: number;
  geminiRequestsUsed: number;
}

export interface DiscoveryResult {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'STOPPED';
  errorDetails: string | null;
  discoveredCount: number;
  qualifiedCount: number;
  duplicatesCount: number;
  websitesAuditedCount: number;
  retrySearch?: boolean;
  retryAfterMs?: number;
  metrics?: {
    providerId: string;
    enriched: number;
    rejected: number;
    inspectionFailures: number;
    directoryRequests: number;
    geminiRequests: number;
    providerError?: string;
    rejectionReasons: Array<{ businessName: string; reason: string; score?: number; websiteStatus: string; inspectionError?: string }>;
    qualifiedLeads: Array<{ id: string; businessName: string; score: number }>;
  };
}

async function insert(tx: Prisma.TransactionClient, segment: DiscoverySegment, trigger: DiscoveryTrigger, scheduledFor: Date | null) {
  const [row] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "AutoHunterLog" ("id", "status", "triggerType", "providerUsed", "country", "city", "industry", "availableAt", "scheduledFor", "profileSnapshot")
    VALUES (${randomUUID()}, 'QUEUED', ${trigger}, ${segment.providerUsed}, ${segment.country}, ${segment.city}, ${segment.industry}, NOW(), ${scheduledFor}, ${segment.profileSnapshot ? JSON.stringify(segment.profileSnapshot) : null}::jsonb)
    ON CONFLICT DO NOTHING
    RETURNING "id"
  `;
  return row?.id;
}

export const discoveryJobs = {
  async enqueueManual(segment: DiscoverySegment) {
    return insert(prisma, segment, 'MANUAL', null);
  },

  async enqueueScheduled(segment: DiscoverySegment, scheduledFor: Date, next: Date | null) {
    return prisma.$transaction(async (tx) => {
      const [config] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "AutoHunterConfig"
        WHERE "id" = 'default' AND "enabled" AND "scheduleMode" <> 'MANUAL'
          AND "nextRunAt" = ${scheduledFor} AND "nextRunAt" <= NOW()
        FOR UPDATE
      `;
      if (!config) return undefined;
      if (await getActiveIdealProfile(tx, true)) return undefined;
      const id = await insert(tx, segment, 'SCHEDULED', scheduledFor);
      if (id) await tx.autoHunterConfig.update({ where: { id: config.id }, data: { nextRunAt: next } });
      return id;
    });
  },

  async enqueueProfileScheduled(config: SchedulerConfig, profile: SavedIdealProfile, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      // The existing config row serializes all scheduled enqueue operations across replicas.
      const [current] = await tx.$queryRaw<Array<{ enabled: boolean; scheduleMode: string; scheduledTime: string; timezone: string; preferredProvider: string }>>`
        SELECT "enabled", "scheduleMode", "scheduledTime", "timezone", "preferredProvider" FROM "AutoHunterConfig" WHERE "id" = 'default' FOR UPDATE
      `;
      if (!current?.enabled || current.scheduleMode !== config.scheduleMode || current.scheduledTime !== config.scheduledTime
        || current.timezone !== config.timezone || current.preferredProvider !== config.preferredProvider) return undefined;
      const active = await getActiveIdealProfile(tx, true);
      if (!active || active.id !== profile.id || active.revision !== profile.revision) return undefined;

      const cursors = await tx.profileScheduleCursor.findMany({ where: { profileId: profile.id } });
      const byLocation = new Map(cursors.map((cursor) => [cursor.locationKey, cursor]));
      const due: Array<{ key: string; nextRunAt: Date; sequence: number; location: typeof profile.targeting.locations[number]; schedule: SchedulerConfig }> = [];
      for (const target of profileSchedules(profile, config)) {
        const existing = byLocation.get(target.key);
        if (!existing || existing.signature !== target.signature) {
          const data = { signature: target.signature, nextRunAt: calculateNextRun(target.schedule, now) };
          await tx.profileScheduleCursor.upsert({
            where: { profileId_locationKey: { profileId: profile.id, locationKey: target.key } },
            create: { profileId: profile.id, locationKey: target.key, ...data }, update: data,
          });
        } else if (existing.nextRunAt && existing.nextRunAt <= now) {
          due.push({ ...target, nextRunAt: existing.nextRunAt, sequence: existing.sequence });
        }
      }
      const next = due.sort((a, b) => +a.nextRunAt - +b.nextRunAt || a.key.localeCompare(b.key))[0];
      if (!next) return undefined;
      const segment = profileSegment(active, config, next.location, next.sequence, next.nextRunAt);
      const id = await insert(tx, segment, 'SCHEDULED', null);
      if (id) await tx.profileScheduleCursor.update({
        where: { profileId_locationKey: { profileId: profile.id, locationKey: next.key } },
        data: { sequence: { increment: 1 }, nextRunAt: calculateNextRun(next.schedule, now, next.nextRunAt) },
      });
      return id;
    }, { timeout: 12000 });
  },

  async claim() {
    await prisma.$executeRaw`
      UPDATE "AutoHunterLog"
      SET "status" = CASE WHEN "stopRequestedAt" IS NULL THEN 'FAILED' ELSE 'STOPPED' END,
          "completedAt" = NOW(), "leaseToken" = NULL, "leaseUntil" = NULL,
          "errorDetails" = CASE WHEN "stopRequestedAt" IS NULL THEN 'Discovery worker lease expired.' ELSE NULL END
      WHERE "status" = 'RUNNING' AND "leaseUntil" <= NOW()
        AND ("attempts" >= ${MAX_ATTEMPTS} OR "stopRequestedAt" IS NOT NULL)
    `;
    const [job] = await prisma.$queryRaw<DiscoveryJob[]>`
      WITH candidate AS (
        SELECT "id" FROM "AutoHunterLog"
        WHERE "availableAt" <= NOW() AND "stopRequestedAt" IS NULL AND "attempts" < ${MAX_ATTEMPTS}
          AND ("status" = 'QUEUED' OR ("status" = 'RUNNING' AND "leaseUntil" <= NOW()))
        ORDER BY "availableAt"
        LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE "AutoHunterLog" AS job
      SET "status" = 'RUNNING', "attempts" = job."attempts" + 1,
          "startedAt" = CASE WHEN job."attempts" = 0 THEN NOW() ELSE job."startedAt" END,
          "leaseToken" = ${randomUUID()}, "leaseUntil" = NOW() + ${LEASE_MS} * INTERVAL '1 millisecond'
      FROM candidate WHERE job."id" = candidate."id"
      RETURNING job."id", job."triggerType", job."providerUsed", job."country", job."city", job."industry", job."attempts", job."leaseToken", job."profileSnapshot", job."geminiRequestsUsed"
    `;
    if (job?.profileSnapshot) job.profileSnapshot = profileSnapshotSchema.parse(job.profileSnapshot);
    return job;
  },

  async renew(job: DiscoveryJob) {
    const count = await prisma.$executeRaw`
      UPDATE "AutoHunterLog" SET "leaseUntil" = NOW() + ${LEASE_MS} * INTERVAL '1 millisecond'
      WHERE "id" = ${job.id} AND "leaseToken" = ${job.leaseToken}
        AND "stopRequestedAt" IS NULL AND "leaseUntil" > NOW()
    `;
    return count > 0;
  },

  async lockForWrite(tx: Prisma.TransactionClient, job: DiscoveryJob) {
    const [record] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "AutoHunterLog" WHERE "id" = ${job.id}
        AND "leaseToken" = ${job.leaseToken} AND "leaseUntil" > NOW()
        AND "stopRequestedAt" IS NULL FOR UPDATE
    `;
    if (!record) return false;
    return job.profileSnapshot ? profileIsCurrent(job.profileSnapshot, tx, true) : !(await getActiveIdealProfile(tx, true));
  },

  async requestStop() {
    const count = await prisma.$executeRaw`
      UPDATE "AutoHunterLog" SET "stopRequestedAt" = NOW(),
        "completedAt" = CASE WHEN "status" = 'QUEUED' THEN NOW() ELSE "completedAt" END,
        "status" = CASE WHEN "status" = 'QUEUED' THEN 'STOPPED' ELSE "status" END
      WHERE "availableAt" IS NOT NULL AND "status" IN ('QUEUED', 'RUNNING') AND "stopRequestedAt" IS NULL
    `;
    return count > 0;
  },

  async getActiveStatus() {
    const [row] = await prisma.$queryRaw<Array<{ status: 'QUEUED' | 'RUNNING' }>>`
      SELECT "status" FROM "AutoHunterLog"
      WHERE "availableAt" IS NOT NULL AND "status" IN ('QUEUED', 'RUNNING')
    `;
    return row?.status ?? null;
  },

  async finish(job: DiscoveryJob, result: DiscoveryResult) {
    const willRetry = Boolean(result.retrySearch && job.attempts < MAX_ATTEMPTS);
    const retryDelay = Math.max(15000 * 2 ** (job.attempts - 1), result.retryAfterMs ?? 0);
    const [row] = await prisma.$queryRaw<Array<{ status: string; completedAt: Date | null }>>`
      UPDATE "AutoHunterLog" SET
        "status" = CASE WHEN "stopRequestedAt" IS NOT NULL THEN 'STOPPED' WHEN ${willRetry} THEN 'QUEUED' ELSE ${result.status} END,
        "availableAt" = CASE WHEN ${willRetry} AND "stopRequestedAt" IS NULL
          THEN NOW() + ${retryDelay}::double precision * INTERVAL '1 millisecond' ELSE "availableAt" END,
        "completedAt" = CASE WHEN ${willRetry} AND "stopRequestedAt" IS NULL THEN NULL ELSE NOW() END,
        "durationMs" = FLOOR(EXTRACT(EPOCH FROM (NOW() - "startedAt")) * 1000)::integer,
        "errorDetails" = ${result.errorDetails}, "leaseToken" = NULL, "leaseUntil" = NULL,
        "discoveredCount" = GREATEST("discoveredCount", ${result.discoveredCount}),
        "qualifiedCount" = GREATEST("qualifiedCount", ${result.qualifiedCount}),
        "duplicatesCount" = GREATEST("duplicatesCount", ${result.duplicatesCount}),
        "websitesAuditedCount" = GREATEST("websitesAuditedCount", ${result.websitesAuditedCount}),
        "qualificationMetrics" = COALESCE(${result.metrics ? JSON.stringify(result.metrics) : null}::jsonb, "qualificationMetrics")
      WHERE "id" = ${job.id} AND "leaseToken" = ${job.leaseToken} AND "leaseUntil" > NOW()
      RETURNING "status", "completedAt"
    `;
    return row;
  },

  async publishProgress(job: DiscoveryJob, result: DiscoveryResult) {
    await prisma.$executeRaw`
      UPDATE "AutoHunterLog" SET
        "discoveredCount" = GREATEST("discoveredCount", ${result.discoveredCount}),
        "duplicatesCount" = GREATEST("duplicatesCount", ${result.duplicatesCount}),
        "websitesAuditedCount" = GREATEST("websitesAuditedCount", ${result.websitesAuditedCount}),
        "qualificationMetrics" = ${JSON.stringify(result.metrics)}::jsonb
      WHERE "id" = ${job.id} AND "leaseToken" = ${job.leaseToken} AND "leaseUntil" > NOW() AND "stopRequestedAt" IS NULL
    `;
  },
};
