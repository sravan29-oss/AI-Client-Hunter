import { LeadStatus, Prisma } from '@prisma/client';
import { prisma, isDatabaseConnected } from '../db/prisma';
import { AppError } from '../utils/errors';
import { isValidTimeZone } from './discovery/discoverySchedule';
import { businessGrowthBuckets, businessGrowthPeriods, type BusinessPeriod, type BusinessRange } from './businessGrowthCalendar';

const activeStages = new Set<string>([
  'Qualified', 'Reviewed', 'Ready_to_Contact', 'Contacted', 'Replied', 'Interested', 'Meeting_Scheduled', 'Negotiation',
]);
const allStages = new Set<string>(Object.values(LeadStatus));

type LeadRow = {
  createdAt: Date; stage: string; qualificationStatus: string | null; assessedScore: boolean; hasProvider: boolean;
};
type ProposalRow = { createdAt: Date; sentAt: Date | null; currency: string | null; totalMinor: unknown };
type FollowUpRow = { dueAt: Date; status: string };
type OutcomeRow = { id: string; action: string; key: string; createdAt: Date; from: string | null; to: string | null };
export type StageTransition = Omit<OutcomeRow, 'action'>;
export type BusinessGrowthRows = {
  leads: LeadRow[]; proposals: ProposalRow[]; followUps: FollowUpRow[]; outcomes: OutcomeRow[];
};

export function recordedClosures(transitions: StageTransition[]) {
  const latest = new Map<string, StageTransition>();
  for (const event of transitions) {
    const from = event.from?.replaceAll(' ', '_');
    const to = event.to?.replaceAll(' ', '_');
    if (!from || !to || from === to || !allStages.has(from) || !allStages.has(to)) continue;
    const last = latest.get(event.key);
    if (!last || last.createdAt < event.createdAt || (last.createdAt.getTime() === event.createdAt.getTime() && last.id < event.id)) {
      latest.set(event.key, event);
    }
  }
  return new Map(Array.from(latest.values()).flatMap(({ key, to }) => to === 'Won' || to === 'Lost' ? [[key, to] as const] : []));
}

export function summarizeBusinessGrowth(rows: BusinessGrowthRows, periods: ReturnType<typeof businessGrowthPeriods>, now: Date) {
  const { current, previous, timezone, dateKey, today, partialToday, comparable } = periods;
  const inRange = (time: Date, period: BusinessPeriod) => time >= period.start && time < period.end;
  const amountDrafts = new Map<string, { currency: 'INR' | 'USD'; totalMinor: bigint; quotes: number }>();
  const { buckets, indexForDate } = businessGrowthBuckets(current);
  const timeline = buckets.map((period) => ({
    ...period,
    leads: 0, providerLeads: 0, proposalsCreated: 0, proposalsDelivered: 0, followUpsDue: 0, followUpsCompleted: 0,
  }));
  const distribution = new Map<string, number>();
  const bucket = (time: Date) => timeline[indexForDate(dateKey(time))];
  let excludedQuoteAmounts = 0;

  function summarize(period: BusinessPeriod, populate: boolean) {
    const counts = { totalLeads: 0, qualifiedLeads: 0, activeOpportunities: 0, proposalsCreated: 0,
      wonDeals: 0, lostDeals: 0, followUpsDue: 0, completedFollowUps: 0 };
    let assessedLeads = 0;
    let providerLeads = 0;
    let scheduledFollowUps = 0;
    for (const lead of rows.leads) {
      if (!inRange(lead.createdAt, period)) continue;
      counts.totalLeads++;
      const qualified = lead.qualificationStatus === 'QUALIFIED' || lead.stage === 'Qualified';
      if (qualified) counts.qualifiedLeads++;
      if (qualified || lead.assessedScore || lead.qualificationStatus === 'REJECTED') assessedLeads++;
      if (activeStages.has(lead.stage)) counts.activeOpportunities++;
      if (lead.hasProvider) providerLeads++;
      if (populate) {
        distribution.set(lead.stage, (distribution.get(lead.stage) ?? 0) + 1);
        const point = bucket(lead.createdAt);
        point.leads++;
        if (lead.hasProvider) point.providerLeads++;
      }
    }
    for (const row of rows.proposals) {
      if (inRange(row.createdAt, period)) {
        counts.proposalsCreated++;
        if (populate) {
          bucket(row.createdAt).proposalsCreated++;
          const { currency, totalMinor } = row;
          if ((currency === 'INR' || currency === 'USD') && typeof totalMinor === 'number'
            && Number.isSafeInteger(totalMinor) && totalMinor >= 0) {
            const total = amountDrafts.get(currency) ?? { currency, totalMinor: 0n, quotes: 0 };
            total.totalMinor += BigInt(totalMinor);
            total.quotes++;
            amountDrafts.set(currency, total);
          } else excludedQuoteAmounts++;
        }
      }
      if (populate && row.sentAt && inRange(row.sentAt, period)) bucket(row.sentAt).proposalsDelivered++;
    }
    for (const row of rows.followUps) {
      if (!inRange(row.dueAt, period)) continue;
      scheduledFollowUps++;
      if (row.status !== 'PENDING') continue;
      counts.followUpsDue++;
      if (populate) bucket(row.dueAt).followUpsDue++;
    }

    const transitions: StageTransition[] = [];
    const completions = new Map<string, OutcomeRow>();
    for (const event of rows.outcomes) {
      if (!inRange(event.createdAt, period)) continue;
      if (event.action === 'FOLLOW_UP_COMPLETED') {
        const first = completions.get(event.key);
        if (!first || event.createdAt < first.createdAt) completions.set(event.key, event);
        continue;
      }
      if (event.action === 'STATUS_CHANGED') transitions.push(event);
    }
    for (const outcome of recordedClosures(transitions).values()) {
      if (outcome === 'Won') counts.wonDeals++;
      if (outcome === 'Lost') counts.lostDeals++;
    }
    counts.completedFollowUps = completions.size;
    if (populate) {
      for (const event of completions.values()) bucket(event.createdAt).followUpsCompleted++;
    }
    return { counts, assessedLeads, providerLeads, scheduledFollowUps, closedDeals: counts.wonDeals + counts.lostDeals };
  }

  const selected = summarize(current, true);
  const prior = summarize(previous, false);
  const evidence = (result: typeof selected) => ({
    totalLeads: result.counts.totalLeads, qualifiedLeads: result.assessedLeads,
    activeOpportunities: result.counts.totalLeads, proposalsCreated: result.counts.proposalsCreated,
    wonDeals: result.closedDeals, lostDeals: result.closedDeals,
    followUpsDue: result.scheduledFollowUps, completedFollowUps: result.counts.completedFollowUps,
  });
  const currentEvidence = evidence(selected);
  const priorEvidence = evidence(prior);
  const kpis = (Object.keys(selected.counts) as Array<keyof typeof selected.counts>).map((key) => ({
    key,
    value: selected.counts[key],
    comparison: comparable && currentEvidence[key] > 0 && priorEvidence[key] > 0 ? {
      value: prior.counts[key],
      delta: selected.counts[key] - prior.counts[key],
    } : null,
  }));
  return {
    timezone, asOf: now.toISOString(), today, partialToday,
    period: { from: current.from, to: current.to },
    previous: comparable ? { from: previous.from, to: previous.to } : null,
    kpis,
    coverage: {
      totalLeads: selected.counts.totalLeads, providerLeads: selected.providerLeads,
      assessedLeads: selected.assessedLeads, proposals: selected.counts.proposalsCreated, closedDeals: selected.closedDeals,
      paymentRecords: null,
    },
    qualification: { added: selected.counts.totalLeads, assessed: selected.assessedLeads, qualified: selected.counts.qualifiedLeads },
    statusDistribution: [...distribution].map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage)),
    timeline,
    quoteValues: [...amountDrafts.values()].map((row) => ({ ...row, totalMinor: row.totalMinor.toString() }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    excludedQuoteAmounts,
    actualRevenue: { status: 'unavailable' as const },
  };
}

export async function getBusinessGrowth(range: BusinessRange, now = new Date()) {
  if (!isDatabaseConnected) throw new AppError('Business Intelligence requires the workspace database.', 503);
  return prisma.$transaction(async (tx) => {
    const settings = await tx.autoHunterConfig.findUnique({ where: { id: 'default' }, select: { timezone: true } });
    const timezone = settings?.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : 'Asia/Kolkata';
    return readBusinessGrowth(tx, businessGrowthPeriods(range, timezone, now), now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function readBusinessGrowth(tx: Prisma.TransactionClient, periods: ReturnType<typeof businessGrowthPeriods>, now: Date) {
    const { current, previous } = periods;
    const window = (field: Prisma.Sql) => Prisma.sql`(
      (${field} >= ${current.start} AND ${field} < ${current.end}) OR
      (${field} >= ${previous.start} AND ${field} < ${previous.end})
    )`;
    // Select only statuses, dates, coverage, and valid amount fields. Keep names, recipients, and quote text out of analytics.
    const [leads, proposals, followUps, outcomes] = await Promise.all([
      tx.$queryRaw<LeadRow[]>`
        SELECT l."createdAt", replace(l."leadStatus"::text, ' ', '_') AS stage, l."qualificationStatus",
          l."qualificationScore" IS NOT NULL AS "assessedScore",
          EXISTS (SELECT 1 FROM "LeadDiscoverySource" s WHERE s."leadId" = l."id"
            AND btrim(s."providerId") <> '' AND btrim(s."reference") <> '') AS "hasProvider"
        FROM "Lead" l WHERE ${window(Prisma.sql`l."createdAt"`)}
      `,
      tx.$queryRaw<ProposalRow[]>`
        SELECT "createdAt", "sentAt", "proposal"->>'currency' AS currency, "proposal"->'totalMinor' AS "totalMinor"
        FROM "Pitch"
        WHERE jsonb_typeof("proposal") = 'object' AND "proposal" <> '{}'::jsonb AND
          (${window(Prisma.sql`"createdAt"`)} OR ${window(Prisma.sql`"sentAt"`)})
      `,
      tx.$queryRaw<FollowUpRow[]>`
        SELECT "dueAt", "status"::text FROM "LeadFollowUp" WHERE ${window(Prisma.sql`"dueAt"`)}
      `,
      tx.$queryRaw<OutcomeRow[]>`
        SELECT a."id", a."action", l."id" AS key, a."createdAt", a."metadata"->>'from' AS "from", a."metadata"->>'to' AS "to"
        FROM "ActivityLog" a JOIN "Lead" l ON l."id" = a."metadata"->>'leadId'
        WHERE a."action" = 'STATUS_CHANGED' AND ${window(Prisma.sql`a."createdAt"`)}
        UNION ALL
        SELECT a."id", a."action", f."id" AS key, a."createdAt", NULL AS "from", NULL AS "to"
        FROM "ActivityLog" a JOIN "LeadFollowUp" f ON f."id" = a."metadata"->>'followUpId'
          AND f."leadId" = a."metadata"->>'leadId'
        WHERE a."action" = 'FOLLOW_UP_COMPLETED' AND f."status" = 'COMPLETED'
          AND ${window(Prisma.sql`a."createdAt"`)}
      `,
    ]);
    return summarizeBusinessGrowth({ leads, proposals, followUps, outcomes }, periods, now);
}
