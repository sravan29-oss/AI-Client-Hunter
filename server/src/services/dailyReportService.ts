import { randomUUID } from 'node:crypto';
import { prisma, isDatabaseConnected, memoryStore } from '../db/prisma';
import { escapeCsvCell } from '../utils/csv';
import { NotFoundError } from '../utils/errors';
import { isValidTimeZone } from './discovery/discoverySchedule';
import { localDateBoundary, localDateKey, shiftCalendarDate } from './reportingDates';

export interface DailyReportData {
  id: string;
  reportDate: Date;
  timezone: string | null;
  localDate: string | null;
  windowEnd: Date | null;
  businessesDiscovered: number;
  qualifiedLeads: number;
  highOpportunityLeads: number;
  leadsByCountry: Record<string, number>;
  leadsByIndustry: Record<string, number>;
  websitesAnalyzed: number;
  duplicatesSkipped: number;
  failedSearches: number;
  summary: string;
  createdAt?: Date;
}

export function reportingWindow(targetDate: Date, timezone: string) {
  const dateKey = localDateKey(timezone);
  const localDate = dateKey(targetDate);
  return { timezone, localDate, start: localDateBoundary(localDate, dateKey),
    end: localDateBoundary(shiftCalendarDate(localDate, 1), dateKey) };
}

function groupLeads(leads: Array<{ country?: string | null; industry?: string }>, key: 'country' | 'industry') {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const value = lead[key] || 'Unknown';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

export class DailyReportService {
  async generateDailyReport(targetDate = new Date()): Promise<DailyReportData> {
    const config = isDatabaseConnected
      ? await prisma.autoHunterConfig.findUnique({ where: { id: 'default' }, select: { timezone: true } })
      : memoryStore.autoHunterConfig;
    const configuredZone = config?.timezone || 'Asia/Kolkata';
    const zone = isValidTimeZone(configuredZone) ? configuredZone : 'UTC';
    const { localDate, start, end } = reportingWindow(targetDate, zone);
    const range = { gte: start, lt: end };
    const inWindow = (row: { createdAt: Date | string }) => {
      const time = new Date(row.createdAt);
      return time >= start && time < end;
    };

    const [leads, searches, logs, websitesAnalyzed] = isDatabaseConnected ? await Promise.all([
      prisma.lead.findMany({ where: { createdAt: range }, select: { country: true, industry: true, qualificationScore: true } }),
      prisma.discoverySearch.findMany({ where: { createdAt: range }, select: { leadsCount: true, errors: true, filters: true } }),
      prisma.autoHunterLog.findMany({ where: { completedAt: range }, select: { status: true, duplicatesCount: true } }),
      prisma.auditReport.count({ where: { createdAt: range } }),
    ]) : [
      memoryStore.leads.filter(inWindow), memoryStore.discoverySearches.filter(inWindow),
      memoryStore.autoHunterLogs.filter((log) => log.completedAt && inWindow({ createdAt: log.completedAt })),
      memoryStore.audits.filter(inWindow).length,
    ];

    const report: DailyReportData = {
      id: randomUUID(), reportDate: start, windowEnd: end, timezone: zone, localDate,
      businessesDiscovered: searches.reduce((count, search) => count + (search.leadsCount ?? 0), 0),
      qualifiedLeads: leads.filter((lead) => typeof lead.qualificationScore === 'number').length,
      highOpportunityLeads: leads.filter((lead) => (lead.qualificationScore ?? 0) >= 75).length,
      leadsByCountry: groupLeads(leads, 'country'),
      leadsByIndustry: groupLeads(leads, 'industry'),
      websitesAnalyzed,
      duplicatesSkipped: logs.reduce((count, log) => count + (log.duplicatesCount ?? 0), 0),
      failedSearches: logs.filter((log) => log.status === 'FAILED').length + searches.filter((search) => {
        const filters = search.filters;
        const automated = filters && typeof filters === 'object' && !Array.isArray(filters) && filters.jobId;
        return !automated && search.leadsCount === 0 && Boolean(search.errors);
      }).length,
      summary: '',
      createdAt: new Date(),
    };
    report.summary = `Daily report for ${localDate} (${zone}). ${report.businessesDiscovered} directory results, ${report.qualifiedLeads} qualified leads and ${report.failedSearches} failed searches.`;

    if (isDatabaseConnected) {
      const [saved] = await prisma.$queryRaw<DailyReportData[]>`
        INSERT INTO "DailyReport" ("id", "reportDate", "timezone", "localDate", "windowEnd", "businessesDiscovered",
          "qualifiedLeads", "highOpportunityLeads", "leadsByCountry", "leadsByIndustry", "websitesAnalyzed", "duplicatesSkipped", "failedSearches", "summary")
        VALUES (${report.id}, ${start}, ${zone}, ${localDate}, ${end}, ${report.businessesDiscovered},
          ${report.qualifiedLeads}, ${report.highOpportunityLeads}, ${JSON.stringify(report.leadsByCountry)}::jsonb,
          ${JSON.stringify(report.leadsByIndustry)}::jsonb, ${websitesAnalyzed}, ${report.duplicatesSkipped}, ${report.failedSearches}, ${report.summary})
        ON CONFLICT ("timezone", "localDate") DO UPDATE SET
          "businessesDiscovered" = EXCLUDED."businessesDiscovered", "qualifiedLeads" = EXCLUDED."qualifiedLeads",
          "highOpportunityLeads" = EXCLUDED."highOpportunityLeads", "leadsByCountry" = EXCLUDED."leadsByCountry",
          "leadsByIndustry" = EXCLUDED."leadsByIndustry", "websitesAnalyzed" = EXCLUDED."websitesAnalyzed",
          "duplicatesSkipped" = EXCLUDED."duplicatesSkipped", "failedSearches" = EXCLUDED."failedSearches", "summary" = EXCLUDED."summary"
        RETURNING *
      `;
      return saved;
    }

    const existing = memoryStore.dailyReports.find((item) => item.timezone === zone && item.localDate === localDate);
    if (existing) {
      Object.assign(existing, report, { id: existing.id, createdAt: existing.createdAt });
      return existing;
    }
    memoryStore.dailyReports.unshift(report);
    return report;
  }

  async getDailyReports(limit = 30): Promise<DailyReportData[]> {
    if (isDatabaseConnected) return prisma.$queryRaw`SELECT * FROM "DailyReport" ORDER BY "reportDate" DESC LIMIT ${limit}`;
    return memoryStore.dailyReports.slice(0, limit);
  }

  async getDailyReportById(id: string): Promise<DailyReportData | null> {
    if (isDatabaseConnected) {
      const [report] = await prisma.$queryRaw<DailyReportData[]>`SELECT * FROM "DailyReport" WHERE "id" = ${id}`;
      return report ?? null;
    }
    return memoryStore.dailyReports.find((item) => item.id === id) ?? null;
  }

  async exportDailyReportCsv(id: string): Promise<{ filename: string; csv: string }> {
    const report = await this.getDailyReportById(id);
    if (!report) throw new NotFoundError('Daily report not found.');
    const legacy = report.windowEnd ? undefined : reportingWindow(new Date(report.reportDate), 'UTC');
    const start = legacy?.start ?? new Date(report.reportDate);
    const end = legacy?.end ?? new Date(report.windowEnd!);
    const date = report.localDate ?? start.toISOString().slice(0, 10);
    const leads = isDatabaseConnected
      ? await prisma.lead.findMany({ where: { createdAt: { gte: start, lt: end } }, orderBy: { opportunityScore: 'desc' } })
      : memoryStore.leads.filter((lead) => new Date(lead.createdAt) >= start && new Date(lead.createdAt) < end);
    const rows: unknown[][] = [
      ['=== AI CLIENT HUNTER DAILY REPORT SUMMARY ==='],
      ['Report Date', date], ['Time Zone', report.timezone ?? 'UTC'],
      ['Total Businesses Discovered', report.businessesDiscovered],
      ['Qualified Leads', report.qualifiedLeads], ['High Opportunity Leads (Score >= 75)', report.highOpportunityLeads],
      ['Websites Analyzed', report.websitesAnalyzed], ['Duplicates Skipped', report.duplicatesSkipped], ['Failed Searches', report.failedSearches],
      [], ['=== BREAKDOWN BY COUNTRY ==='], ...Object.entries(report.leadsByCountry || {}),
      [], ['=== BREAKDOWN BY INDUSTRY ==='], ...Object.entries(report.leadsByIndustry || {}),
      [], ['=== LEADS DISCOVERED ON THIS DATE ==='],
    ];
    const header = 'Business Name,Website,Country,City,Industry,Opportunity Score,Lead Status,Recommended Service,Email,Phone,Source';
    const details = leads.map((lead) => [
      lead.businessName, lead.website, lead.country, lead.city, lead.industry, lead.opportunityScore,
      lead.leadStatus, lead.suggestedServices?.[0] || 'Website development', lead.businessEmail,
      lead.publicBusinessPhone, lead.source,
    ].map(escapeCsvCell).join(','));
    return {
      filename: `client_hunter_daily_report_${date}.csv`,
      csv: [...rows.map((row) => row.map(escapeCsvCell).join(',')), header, ...details].join('\r\n'),
    };
  }
}

export const dailyReportService = new DailyReportService();
