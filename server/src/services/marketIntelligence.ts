import { Prisma } from '@prisma/client';
import { isDatabaseConnected, prisma } from '../db/prisma';
import { AppError } from '../utils/errors';
import { isValidTimeZone } from './discovery/discoverySchedule';
import { targetingSchema, normalizedLabel, type IdealProfileTargeting } from './idealProfileTypes';
import { businessGrowthBuckets, businessGrowthPeriods, type BusinessRange } from './businessGrowthCalendar';
import { recordedClosures, type StageTransition } from './businessGrowth';
import { evaluateLeadPriority, jsonObject, priorityCategories, priorityRules, type LeadResponse, type PriorityLead } from './leadPriority';

const minimumSample = 10;
const recommendationsLimit = 8;
type PeriodInput = Pick<ReturnType<typeof businessGrowthPeriods>, 'current' | 'dateKey' | 'timezone'>;
type MarketGroup = {
  key: string; label: string; leads: number; qualified: number; assessed: number; highPriority: number;
  proposals: number; closed: number; won: number; lost: number; sourced: number;
};
export type ResponseRow = { key: string; kind: string | null; occurredAt: string | null; sentAt: Date };

export function latestRecordedResponses(rows: ResponseRow[], now: Date) {
  const result = new Map<string, LeadResponse>();
  for (const row of rows) {
    if (!row.occurredAt || !row.kind || !['INTERESTED', 'QUESTION', 'BUDGET', 'TIMING', 'NOT_INTERESTED', 'OPT_OUT', 'OTHER'].includes(row.kind)) continue;
    const date = new Date(row.occurredAt);
    if (!Number.isFinite(date.getTime()) || date < row.sentAt || date > now) continue;
    const previous = result.get(row.key);
    // In a tie, favor a restriction so simultaneous notes cannot grant a positive signal over an opt-out.
    const precedence = (kind: string) => kind === 'OPT_OUT' ? 2 : kind === 'NOT_INTERESTED' ? 1 : 0;
    if (!previous || previous.date < date
      || (previous.date.getTime() === date.getTime() && (precedence(row.kind) > precedence(previous.kind)
        || (precedence(row.kind) === precedence(previous.kind) && row.kind < previous.kind)))) {
      result.set(row.key, { kind: row.kind, date });
    }
  }
  return result;
}

export function summarizeMarketIntelligence(input: {
  leads: PriorityLead[]; period: PeriodInput; now: Date; responses: Map<string, LeadResponse>;
  transitions: StageTransition[]; offerings: string[]; targeting: IdealProfileTargeting | null;
}) {
  const { leads, period, now, responses, transitions, offerings, targeting } = input;
  const { current, dateKey } = period;
  const included = (date: Date) => date >= current.start && date < current.end;
  const outcomes = recordedClosures(transitions.filter(({ createdAt }) => included(createdAt)));
  const industries = new Map<string, MarketGroup>();
  const locations = new Map<string, MarketGroup>();
  const industryBuckets = new Map<string, number[]>();
  const { buckets, indexForDate } = businessGrowthBuckets(current);
  const priority = priorityCategories.map((category) => ({ category, count: 0 }));
  let withProvider = 0;
  let withIndustry = 0;
  let sourcedIndustry = 0;
  let verifiedCountry = 0;
  let verifiedCity = 0;
  let excludedClosed = 0;
  const candidates: ReturnType<typeof evaluateLeadPriority>[] = [];
  const seen = new Set<string>();

  function addGroup(groups: Map<string, MarketGroup>, key: string, label: string, item: {
    qualified: boolean; assessed: boolean; high: boolean; proposals: number; outcome?: 'Won' | 'Lost'; sourced: boolean;
  }) {
    const group = groups.get(key) ?? { key, label, leads: 0, qualified: 0, assessed: 0, highPriority: 0,
      proposals: 0, closed: 0, won: 0, lost: 0, sourced: 0 };
    group.leads++;
    if (label.localeCompare(group.label) < 0) group.label = label;
    if (item.qualified) group.qualified++;
    if (item.assessed) group.assessed++;
    if (item.high) group.highPriority++;
    if (item.sourced) group.sourced++;
    group.proposals += item.proposals;
    if (item.outcome) {
      group.closed++;
      group[item.outcome === 'Won' ? 'won' : 'lost']++;
    }
    groups.set(key, group);
  }

  for (const lead of leads) {
    if (seen.has(lead.id) || !included(lead.createdAt)) continue;
    seen.add(lead.id);
    const score = evaluateLeadPriority(lead, { offerings, targeting, response: responses.get(lead.id), now });
    if (score.sourceCount) withProvider++;
    if (score.industry) withIndustry++;
    if (score.industrySourced) sourcedIndustry++;
    if (score.location) verifiedCountry++;
    if (score.location?.city) verifiedCity++;
    if (score.open) {
      const group = priority.find((item) => item.category === score.category)!;
      group.count++;
      candidates.push(score);
    } else excludedClosed++;
    const activity = {
      qualified: score.qualified, assessed: score.qualified || lead.qualificationScore !== null || lead.qualificationStatus === 'REJECTED',
      high: score.open && score.category === 'high', outcome: outcomes.get(lead.id),
      proposals: lead.pitches.filter(({ proposal, createdAt }) => included(createdAt) && Object.keys(jsonObject(proposal)).length > 0).length,
    };
    const industryKey = score.industry ? 'industry:' + normalizedLabel(score.industry) : 'unrecorded';
    addGroup(industries, industryKey, score.industry ?? 'Industry unrecorded', { ...activity, sourced: score.industrySourced });
    const location = score.location;
    const locationKey = location ? location.countryCode + ':' + (location.city ? normalizedLabel(location.city) : '') : 'unverified';
    const label = location ? [location.city ?? 'City unverified', location.country].join(', ') : 'Location unverified';
    addGroup(locations, locationKey, label, { ...activity, sourced: Boolean(location) });

    const series = industryBuckets.get(industryKey) ?? Array<number>(buckets.length).fill(0);
    series[indexForDate(dateKey(lead.createdAt))]++;
    industryBuckets.set(industryKey, series);
  }

  const ordered = (groups: Map<string, MarketGroup>) => [...groups.values()]
    .sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  const industryRows = ordered(industries);
  const series = [
    ...industryRows.slice(0, 6).map((row, index) => ({ id: 'series' + index, label: row.label, keys: [row.key] })),
    ...(industryRows.length > 6 ? [{ id: 'other', label: 'Other industry cohorts', keys: industryRows.slice(6).map((row) => row.key) }] : []),
  ];
  const industryTrend = {
    series: series.map(({ id, label }) => ({ id, label })),
    points: buckets.map((bucket, index) => ({
      ...bucket, counts: Object.fromEntries(series.map(({ id, keys }) => [
        id, keys.reduce((total, key) => total + (industryBuckets.get(key)?.[index] ?? 0), 0),
      ])),
    })),
  };
  const rate = (numerator: number, denominator: number) => denominator >= minimumSample ? Math.round(numerator / denominator * 100) : null;
  const rank = Object.fromEntries(priorityCategories.map((category, index) => [category, index]));
  const recommendations = candidates.sort((a, b) =>
    Number(a.restricted) - Number(b.restricted) || rank[a.category] - rank[b.category] || b.score - a.score
    || a.businessName.localeCompare(b.businessName) || a.id.localeCompare(b.id)).slice(0, recommendationsLimit)
    .map(({ open: _open, restricted: _restricted, industrySourced: _sourced, ...item }) => ({
      ...item, location: item.location ? { city: item.location.city, country: item.location.country } : null,
    }));

  return {
    period: { from: current.from, to: current.to }, timezone: period.timezone, asOf: now.toISOString(),
    provenance: 'evidence_fallback' as const, rules: priorityRules, minimumSample, priority, excludedClosed,
    coverage: { leads: seen.size, withProvider, withIndustry, sourcedIndustry, verifiedCountry, verifiedCity },
    industries: industryRows.map((row) => ({
      ...row, qualificationRate: rate(row.qualified, row.assessed), winRate: rate(row.won, row.closed),
    })),
    locations: ordered(locations).map(({ won, lost, ...row }) => ({
      ...row, won: row.sourced && row.closed >= minimumSample ? won : null,
      lost: row.sourced && row.closed >= minimumSample ? lost : null,
      winRate: row.sourced ? rate(won, row.closed) : null,
    })),
    industryTrend, recommendations,
  };
}

export async function getMarketIntelligence(range: BusinessRange, now = new Date()) {
  if (!isDatabaseConnected) throw new AppError('Market intelligence requires the workspace database.', 503);
  return prisma.$transaction(async (tx) => {
    const settings = await tx.autoHunterConfig.findUnique({ where: { id: 'default' }, select: { timezone: true } });
    const timezone = settings?.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : 'Asia/Kolkata';
    return readMarketIntelligence(tx, businessGrowthPeriods(range, timezone, now), now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function readMarketIntelligence(tx: Prisma.TransactionClient, period: PeriodInput, now: Date) {
    const [profile, target] = await Promise.all([
      tx.businessProfile.findUnique({ where: { id: 'workspace' }, select: { services: true } }),
      tx.idealClientProfile.findFirst({
        where: { active: true }, orderBy: [{ activatedAt: 'desc' }, { id: 'asc' }], select: { targeting: true },
      }),
    ]);
    const { start, end } = period.current;
    const [leads, transitions, responseRows] = await Promise.all([
      tx.lead.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: {
          id: true, businessName: true, website: true, country: true, city: true, industry: true, leadStatus: true, createdAt: true,
          qualificationStatus: true, qualificationScore: true, discoveryEvidence: true,
          discoverySources: { select: { providerId: true, reference: true, sourceUrl: true } },
          audits: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 3, select: { websiteUrl: true, rawData: true } },
          pitches: { where: { OR: [{ proposal: { not: Prisma.DbNull } }, { sentAt: { not: null } }] },
            select: { createdAt: true, status: true, proposal: true, sentAt: true } },
          followUps: { where: { status: 'PENDING' }, orderBy: { dueAt: 'asc' }, take: 1, select: { dueAt: true } },
          communicationPolicies: { where: { status: { in: ['RESTRICTED', 'OPTED_OUT', 'SUPPRESSED'] } },
            select: { scope: true, status: true } },
        },
      }),
      tx.$queryRaw<StageTransition[]>`
        SELECT a."id", l."id" AS key, a."createdAt", a."metadata"->>'from' AS "from", a."metadata"->>'to' AS "to"
        FROM "ActivityLog" a JOIN "Lead" l ON l."id" = a."metadata"->>'leadId'
        WHERE a."action" = 'STATUS_CHANGED' AND a."createdAt" >= ${start} AND a."createdAt" < ${end}
          AND l."createdAt" >= ${start} AND l."createdAt" < ${end}
      `,
      tx.$queryRaw<ResponseRow[]>`
        SELECT l."id" AS key, a."metadata"->>'kind' AS kind, a."metadata"->>'occurredAt' AS "occurredAt", p."sentAt"
        FROM "ActivityLog" a JOIN "Lead" l ON l."id" = a."metadata"->>'leadId'
        JOIN "Pitch" p ON p."id" = a."metadata"->>'pitchId' AND p."leadId" = l."id"
        WHERE a."action" = 'COMMUNICATION_RESPONSE' AND p."sentAt" IS NOT NULL
          AND l."createdAt" >= ${start} AND l."createdAt" < ${end}
      `,
    ]);
    const targeting = targetingSchema.safeParse(target?.targeting).data ?? null;
    return summarizeMarketIntelligence({ leads, period, now, responses: latestRecordedResponses(responseRows, now),
      transitions, offerings: profile?.services ?? [], targeting });
}
