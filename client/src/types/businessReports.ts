import type { BusinessGrowthReport } from './businessGrowth';
import type { MarketIntelligenceReport } from './marketIntelligence';

export type ReportKind = 'weekly' | 'monthly';
export type ReportDestination = 'leads' | 'followups' | 'projects' | 'engagement' | 'find-clients';
type Count = { value: number; comparison: { value: number; delta: number } | null };

export interface BusinessReportHeader {
  id: string;
  kind: ReportKind;
  timezone: string;
  periodFrom: string;
  periodTo: string;
  origin: 'deterministic' | 'gemini';
  createdAt: string;
  sourceReportId: string | null;
}

export interface BusinessReport extends BusinessReportHeader {
  snapshot: {
    version: 1;
    measuredAt: string;
    partialToday: boolean;
    previous: BusinessGrowthReport['previous'];
    discovered: Count;
    growth: Pick<BusinessGrowthReport, 'kpis' | 'qualification' | 'statusDistribution' | 'quoteValues' | 'excludedQuoteAmounts' | 'actualRevenue'>;
    proposalsDelivered: number;
    market: Pick<MarketIntelligenceReport, 'coverage' | 'priority' | 'industries' | 'locations' | 'minimumSample'>;
    review: Array<{ id: string; businessName: string; score: number; category: string; nextAction: string }>;
    engagement: { deliveries: Count; replies: Count; responses: number; objections: Array<{ label: string; count: number }> };
    insights: Array<{
      id: string; observation: string; support: string[]; implication: string; coverageImplication: string;
      action: { label: string; destination: ReportDestination }; quality: string; emphasis: 'impact' | 'coverage';
    }>;
    model: string | null;
  };
}

export interface BusinessReportHistory {
  records: BusinessReportHeader[];
  timezone: string;
  today: string;
  geminiAvailable: boolean;
  nextCursor: string | null;
}

export type BusinessReportInterpretationStatus = 'generated' | 'already_saved' | 'unavailable' | 'no_data' | 'cooldown' | 'fallback';
