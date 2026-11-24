import { Prisma, type BusinessReport } from '@prisma/client';
import { isDatabaseConnected, prisma } from '../db/prisma';
import { AppError, NotFoundError } from '../utils/errors';
import { escapeCsvCell } from '../utils/csv';
import { isValidTimeZone } from './discovery/discoverySchedule';
import { businessReportPeriods, type BusinessReportRequest } from './businessReportCalendar';
import { readBusinessGrowth } from './businessGrowth';
import { readMarketIntelligence } from './marketIntelligence';
import { localDateKey } from './reportingDates';

type Period = ReturnType<typeof businessReportPeriods>;
type Growth = Awaited<ReturnType<typeof readBusinessGrowth>>;
type Market = Awaited<ReturnType<typeof readMarketIntelligence>>;
type Comparison = { value: number; delta: number } | null;
type Count = { value: number; comparison: Comparison };
type Destination = 'leads' | 'followups' | 'projects' | 'engagement' | 'find-clients';

export type ReportInsight = {
  id: string;
  observation: string;
  support: string[];
  implication: string;
  coverageImplication: string;
  action: { label: string; destination: Destination };
  quality: string;
  emphasis: 'impact' | 'coverage';
};
type ReportMeasurements = {
  measuredAt: string;
  partialToday: boolean;
  previous: { from: string; to: string } | null;
  discovered: Count;
  growth: Pick<Growth, 'kpis' | 'qualification' | 'statusDistribution' | 'quoteValues' | 'excludedQuoteAmounts' | 'actualRevenue'>;
  proposalsDelivered: number;
  market: Pick<Market, 'coverage' | 'priority' | 'industries' | 'locations' | 'minimumSample'>;
  review: Array<{ id: string; businessName: string; score: number; category: string; nextAction: string }>;
  engagement: { deliveries: Count; replies: Count; responses: number; objections: Array<{ label: string; count: number }> };
};
export type ReportSnapshot = ReportMeasurements & {
  version: 1;
  insights: ReportInsight[];
  model: string | null;
};

export const reportMetricLabels: Record<Growth['kpis'][number]['key'], string> = {
  totalLeads: 'CRM leads added', qualifiedLeads: 'Qualified leads', activeOpportunities: 'Active opportunities',
  proposalsCreated: 'Proposals created', wonDeals: 'Won opportunities', lostDeals: 'Lost opportunities',
  followUpsDue: 'Follow-ups due', completedFollowUps: 'Follow-ups completed',
};

const responseKinds = new Set(['INTERESTED', 'QUESTION', 'BUDGET', 'TIMING', 'NOT_INTERESTED', 'OPT_OUT', 'OTHER']);
const objections: Record<string, string> = { BUDGET: 'Budget', TIMING: 'Timing', NOT_INTERESTED: 'Declined', OPT_OUT: 'Opt-out' };

function metric(measured: ReportMeasurements, key: Growth['kpis'][number]['key']) {
  return measured.growth.kpis.find((item) => item.key === key)?.value ?? 0;
}

export function deterministicReportInsights(m: ReportMeasurements): ReportInsight[] {
  const { coverage, priority, industries } = m.market;
  const high = priority.find((item) => item.category === 'high')?.count ?? 0;
  const insufficient = priority.find((item) => item.category === 'insufficient')?.count ?? 0;
  const due = metric(m, 'followUpsDue');
  const completed = metric(m, 'completedFollowUps');
  const proposals = metric(m, 'proposalsCreated');
  const losses = metric(m, 'lostDeals');
  const largest = industries.reduce((max, item) => Math.max(max, item.leads), 0);
  const objectionCount = m.engagement.objections.reduce((sum, item) => sum + item.count, 0);
  const rows: Omit<ReportInsight, 'emphasis'>[] = [
    {
      id: 'acquisition', observation: 'Lead acquisition in the selected period.',
      support: [`${m.discovered.value} first recorded provider discoveries`, `${coverage.leads} CRM leads added`,
        ...(m.discovered.comparison ? [`${m.discovered.comparison.value} provider discoveries in the comparison period`] : [])],
      implication: 'Provider discoveries and CRM creations measure different events.',
      coverageImplication: 'Review source evidence before assigning acquisition credit.',
      action: { label: 'Review acquisition sources', destination: 'find-clients' },
      quality: m.discovered.value ? 'Dated provider observations' : 'No dated provider discoveries in this period',
    },
    {
      id: 'priority', observation: 'Evidence available for lead review.',
      support: [`${high} High Priority leads`, `${insufficient} open leads with Insufficient Data`],
      implication: high ? 'High Priority records have enough documented signals to justify an internal review.'
        : 'The current cohort has no High Priority records under the saved scoring rules.',
      coverageImplication: 'Missing information limits the strength of the priority score.',
      action: { label: high ? 'Review high-priority records' : 'Review missing lead evidence', destination: 'leads' },
      quality: 'Deterministic scoring of the current cohort at generation time',
    },
    {
      id: 'industry', observation: 'Industry activity and qualification coverage.',
      support: [`${largest} leads in the largest recorded industry group`, `${coverage.sourcedIndustry} matching provider categories`,
        `${m.growth.qualification.assessed} assessed leads`],
      implication: 'Activity identifies which lead groups have records to inspect. Conversion evidence is needed to compare outcomes.',
      coverageImplication: 'CRM industry labels may include defaults. Provider category coverage helps identify where to validate the labels.',
      action: { label: 'Review industry cohorts in Leads', destination: 'leads' },
      quality: `Group rates require at least ${m.market.minimumSample} relevant records`,
    },
    {
      id: 'location', observation: 'Coverage of verified locations.',
      support: [`${coverage.verifiedCity} verified city records`, `${coverage.verifiedCountry} verified country records`, `${coverage.leads} cohort leads`],
      implication: 'Verified location evidence supports geographic review.',
      coverageImplication: 'Sparse city coverage limits meaningful location comparisons.',
      action: { label: 'Check missing location evidence', destination: 'leads' },
      quality: 'Saved provider corroboration only',
    },
    {
      id: 'proposals', observation: 'Proposal activity and recorded sales outcomes.',
      support: [`${proposals} proposals created`, `${m.proposalsDelivered} proposal deliveries recorded`, `${losses} recorded losses`],
      implication: losses ? 'Review the recorded losses before deciding whether a recurring issue exists.' : 'Review open proposal activity and its next steps.',
      coverageImplication: 'Quote amounts describe proposal face value. Loss reasons require review of the original CRM records.',
      action: { label: proposals || !losses ? 'Review proposal follow-up' : 'Review recorded loss outcomes',
        destination: proposals || !losses ? 'projects' : 'leads' },
      quality: 'Dated CRM records. Payment data unavailable.',
    },
    {
      id: 'followups', observation: 'Follow-up workload and completions.',
      support: [`${due} pending follow-ups due`, `${completed} recorded completions`],
      implication: due ? 'Pending due reminders are a concrete review queue.' : 'There are no pending due reminders dated in this period.',
      coverageImplication: 'Completion totals require dated completion events. Due reminders reflect their state at generation time.',
      action: { label: due ? 'Review due follow-ups' : 'Review follow-up records', destination: 'followups' },
      quality: 'Saved reminders and linked completion events',
    },
    {
      id: 'engagement', observation: 'Recorded engagement and objections.',
      support: [`${m.engagement.deliveries.value} manually recorded deliveries`, `${m.engagement.replies.value} distinct pitches with recorded responses`,
        `${objectionCount} recorded objections or opt-outs`],
      implication: objectionCount ? 'Review the reported objections before changing outreach or proposal language.'
        : 'Use linked manual responses to assess engagement as more records become available.',
      coverageImplication: 'Unrecorded responses and delivery confirmations are outside the measured totals.',
      action: { label: 'Review engagement history', destination: 'engagement' },
      quality: m.engagement.responses ? 'Linked manual response events' : 'No dated linked responses in this period',
    },
  ];
  return rows.map((row) => ({ ...row, emphasis: 'impact' }));
}

function comparison(value: number, previous: number, comparable: boolean) {
  return comparable && value > 0 && previous > 0 ? { value: previous, delta: value - previous } : null;
}

async function readReportActivity(tx: Prisma.TransactionClient, periods: Period, measuredAt: Date) {
  const { current, previous, comparable } = periods;
  const inScope = (field: Prisma.Sql) => Prisma.sql`((
    ${field} >= ${current.start} AND ${field} < ${current.end}
  ) OR (${field} >= ${previous.start} AND ${field} < ${previous.end}))`;
  const [sources, deliveries, events] = await Promise.all([
    tx.$queryRaw<{ date: Date }[]>`
      SELECT observations.date FROM (
        SELECT min(s."firstDiscoveredAt") AS date
        FROM "LeadDiscoverySource" s
        WHERE lower(btrim(s."providerId")) IN ('google_places','serpapi','overpass','openstreetmap')
          AND btrim(s."reference") <> ''
        GROUP BY s."leadId"
      ) observations WHERE ${inScope(Prisma.sql`observations.date`)}
    `,
    tx.$queryRaw<{ date: Date }[]>`
      SELECT "sentAt" AS date FROM "Pitch" WHERE "leadId" IS NOT NULL AND ${inScope(Prisma.sql`"sentAt"`)}
    `,
    tx.$queryRaw<{ key: string; kind: string | null; happened: string | null; sentAt: Date }[]>`
      SELECT p."id" AS key, a."metadata"->>'kind' AS kind, a."metadata"->>'occurredAt' AS happened, p."sentAt"
      FROM "ActivityLog" a JOIN "Pitch" p ON p."id" = a."metadata"->>'pitchId'
        AND p."leadId" = a."metadata"->>'leadId'
      WHERE a."action" = 'COMMUNICATION_RESPONSE'
        AND p."sentAt" IS NOT NULL AND p."sentAt" < ${current.end}
    `,
  ]);
  const inside = (date: Date, period: Period['current']) => date >= period.start && date < period.end;
  const responses = events.flatMap((event) => {
    if (!event.kind || !responseKinds.has(event.kind) || !event.happened) return [];
    const date = new Date(event.happened);
    return Number.isFinite(+date) && date >= event.sentAt && date <= measuredAt ? [{ ...event, date }] : [];
  });
  const currentResponses = responses.filter(({ date }) => inside(date, current));
  const measureCount = (data: { date: Date }[]): Count => {
    const value = data.filter(({ date }) => inside(date, current)).length;
    const prior = data.filter(({ date }) => inside(date, previous)).length;
    return { value, comparison: comparison(value, prior, comparable) };
  };
  const replyCount = (period: Period['current']) => new Set(responses.filter(({ date }) => inside(date, period)).map(({ key }) => key)).size;
  const replies = replyCount(current);
  return {
    discovered: measureCount(sources),
    engagement: {
      deliveries: measureCount(deliveries),
      replies: { value: replies, comparison: comparison(replies, replyCount(previous), comparable) },
      responses: currentResponses.length,
      objections: Object.entries(objections).flatMap(([kind, label]) => {
        const count = currentResponses.filter((item) => item.kind === kind).length;
        return count ? [{ label, count }] : [];
      }),
    },
  };
}

async function reportingZone(db: Prisma.TransactionClient) {
  const settings = await db.autoHunterConfig.findUnique({ where: { id: 'default' }, select: { timezone: true } });
  return settings?.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : 'Asia/Kolkata';
}

const reportHeader = {
  id: true, kind: true, timezone: true, periodFrom: true, periodTo: true,
  origin: true, createdAt: true, sourceReportId: true,
} satisfies Prisma.BusinessReportSelect;
function databaseRequired() {
  if (!isDatabaseConnected) throw new AppError('Business reports require the workspace database.', 503);
}

export async function listBusinessReports(after?: string) {
  databaseRequired();
  const pageSize = 50;
  const [timezone, rows] = await Promise.all([
    reportingZone(prisma),
    prisma.businessReport.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: pageSize + 1, select: reportHeader,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    }),
  ]);
  const records = rows.slice(0, pageSize);
  return { records, timezone, today: localDateKey(timezone)(new Date()),
    nextCursor: rows.length > pageSize ? records[pageSize - 1].id : null };
}

export function reportContent(report: BusinessReport): ReportSnapshot {
  const snapshot = report.snapshot as unknown as ReportSnapshot;
  if (snapshot?.version !== 1) throw new AppError('This snapshot format is unavailable in the current report viewer.', 500);
  return snapshot;
}

export async function loadBusinessReport(id: string) {
  databaseRequired();
  const report = await prisma.businessReport.findUnique({ where: { id } });
  if (!report) throw new NotFoundError('Business report not found.');
  reportContent(report);
  return report;
}

export async function generateBusinessReport(input: BusinessReportRequest, now = new Date()) {
  databaseRequired();
  return prisma.$transaction(async (tx) => {
    const timezone = await reportingZone(tx);
    const periods = businessReportPeriods(input, timezone, now);
    const [growth, market, activity] = await Promise.all([
      readBusinessGrowth(tx, periods, now),
      readMarketIntelligence(tx, periods, now),
      readReportActivity(tx, periods, now),
    ]);
    const measurements: ReportMeasurements = {
      measuredAt: now.toISOString(), partialToday: growth.partialToday, previous: growth.previous, ...activity,
      growth: { kpis: growth.kpis, qualification: growth.qualification, statusDistribution: growth.statusDistribution,
        quoteValues: growth.quoteValues, excludedQuoteAmounts: growth.excludedQuoteAmounts, actualRevenue: growth.actualRevenue },
      proposalsDelivered: growth.timeline.reduce((sum, row) => sum + row.proposalsDelivered, 0),
      market: { coverage: market.coverage, priority: market.priority, industries: market.industries,
        locations: market.locations, minimumSample: market.minimumSample },
      review: market.recommendations.map(({ id, businessName, score, category, nextAction }) => ({ id, businessName, score, category, nextAction })),
    };
    const snapshot: ReportSnapshot = { version: 1, ...measurements, insights: deterministicReportInsights(measurements), model: null };
    return tx.businessReport.create({ data: {
      kind: input.kind, timezone, periodFrom: periods.current.from, periodTo: periods.current.to,
      origin: 'deterministic', createdAt: now, snapshot: snapshot as unknown as Prisma.InputJsonValue,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export function businessReportCsv(report: BusinessReport) {
  const s = reportContent(report);
  const rows: unknown[][] = [
    ['Section', 'Metric', 'Value', 'Unit', 'Previous', 'Scope'],
    ['Report', 'Kind', report.kind],
    ['Report', 'From', report.periodFrom],
    ['Report', 'To', report.periodTo],
    ['Report', 'Timezone', report.timezone],
    ['Report', 'Generated at', report.createdAt.toISOString()],
    ['Report', 'Measured as of', s.measuredAt],
    ['Report', 'Provenance', report.origin],
    ['Report', 'Partial current day', s.partialToday ? 'Yes' : 'No'],
    ['Report', 'Previous from', s.previous?.from ?? 'Unavailable'],
    ['Report', 'Previous to', s.previous?.to ?? 'Unavailable'],
    ['Acquisition', 'First provider discoveries', s.discovered.value, 'Leads', s.discovered.comparison?.value],
    ...s.growth.kpis.map((row) => ['CRM', reportMetricLabels[row.key], row.value, 'Count', row.comparison?.value]),
    ['CRM', 'Assessed leads in the cohort', s.growth.qualification.assessed, 'Count'],
    ...s.market.priority.map(({ category, count }) => ['Priority', category, count, 'Open leads']),
    ...s.growth.statusDistribution.map(({ stage, count }) => ['Pipeline', stage, count, 'Cohort leads']),
    ['Proposals', 'Recorded proposal deliveries', s.proposalsDelivered, 'Count'],
    ['Proposals', 'Proposals without usable amount', s.growth.excludedQuoteAmounts, 'Count'],
    ...s.growth.quoteValues.map(({ currency, totalMinor }) => [
      'Proposals', 'Saved quote face value', totalMinor, currency + ' minor units', '', 'Recorded quote amount',
    ]),
    ['Revenue', 'Actual revenue', 'Unavailable', '', '', 'No verified payment data'],
    ['Engagement', 'Manually recorded deliveries', s.engagement.deliveries.value, 'Count', s.engagement.deliveries.comparison?.value],
    ['Engagement', 'Distinct pitches with a response', s.engagement.replies.value, 'Count', s.engagement.replies.comparison?.value],
    ['Engagement', 'Recorded responses', s.engagement.responses, 'Count'],
    ...s.engagement.objections.map(({ label, count }) => ['Engagement', label, count, 'Recorded responses']),
    ['Coverage', 'Lead cohort', s.market.coverage.leads, 'Leads'],
    ['Coverage', 'Structured provider references', s.market.coverage.withProvider, 'Leads'],
    ['Coverage', 'Provider-corroborated industry', s.market.coverage.sourcedIndustry, 'Leads'],
    ['Coverage', 'Verified country', s.market.coverage.verifiedCountry, 'Leads'],
    ['Coverage', 'Verified city', s.market.coverage.verifiedCity, 'Leads'],
    ...s.market.industries.flatMap((group) => [
      ['Industry', group.label, group.leads, 'Leads'], ['Industry', group.label, group.qualified, 'Qualified'],
      ['Industry', group.label, group.highPriority, 'High Priority'],
      ['Industry', group.label, group.proposals, 'Proposals'], ['Industry', group.label, group.closed, 'Dated closures'],
      ['Industry', group.label, group.winRate ?? 'Unavailable', 'Win rate percent'],
    ]),
    ...s.market.locations.flatMap((group) => [
      ['Location', group.label, group.leads, 'Leads'], ['Location', group.label, group.qualified, 'Qualified'],
      ['Location', group.label, group.highPriority, 'High Priority'], ['Location', group.label, group.proposals, 'Proposals'],
      ['Location', group.label, group.closed, 'Dated closures'], ['Location', group.label, group.winRate ?? 'Unavailable', 'Win rate percent'],
    ]),
  ];
  return rows.map((row) => Array.from({ length: 6 }, (_, index) => escapeCsvCell(row[index])).join(',')).join('\r\n') + '\r\n';
}
