export type GrowthRange = 'last7' | 'last30' | 'last90' | 'thisMonth' | 'previousMonth' | 'custom';
export type GrowthSelection = { range: GrowthRange; from?: string; to?: string };
export type GrowthPeriod = { from: string; to: string };
export type GrowthMetric =
  | 'totalLeads' | 'qualifiedLeads' | 'activeOpportunities' | 'proposalsCreated'
  | 'wonDeals' | 'lostDeals' | 'followUpsDue' | 'completedFollowUps';

export interface GrowthPoint extends GrowthPeriod {
  leads: number;
  providerLeads: number;
  proposalsCreated: number;
  proposalsDelivered: number;
  followUpsDue: number;
  followUpsCompleted: number;
}

export interface BusinessGrowthReport {
  timezone: string;
  asOf: string;
  today: string;
  partialToday: boolean;
  period: GrowthPeriod;
  previous: GrowthPeriod | null;
  kpis: Array<{ key: GrowthMetric; value: number; comparison: { value: number; delta: number } | null }>;
  coverage: {
    totalLeads: number;
    providerLeads: number;
    assessedLeads: number;
    proposals: number;
    closedDeals: number;
    paymentRecords: null;
  };
  qualification: { added: number; assessed: number; qualified: number };
  statusDistribution: Array<{ stage: string; count: number }>;
  timeline: GrowthPoint[];
  quoteValues: Array<{ currency: 'INR' | 'USD'; totalMinor: string; quotes: number }>;
  excludedQuoteAmounts: number;
  actualRevenue: { status: 'unavailable' };
}
