import type { GrowthPeriod } from './businessGrowth';

export type PriorityCategory = 'high' | 'medium' | 'low' | 'insufficient';
interface ScoreFactor { code: string; points: number; reason: string }

interface MarketGroup {
  key: string;
  label: string;
  leads: number;
  qualified: number;
  assessed: number;
  highPriority: number;
  proposals: number;
  closed: number;
  sourced: number;
  winRate: number | null;
}
export interface IndustryGroup extends MarketGroup {
  won: number;
  lost: number;
  qualificationRate: number | null;
}
export interface LocationGroup extends MarketGroup {
  won: number | null;
  lost: number | null;
}
export interface MarketRecommendation {
  id: string;
  businessName: string;
  industry: string | null;
  qualified: boolean;
  location: { city: string | null; country: string } | null;
  score: number;
  category: PriorityCategory;
  increases: ScoreFactor[];
  decreases: ScoreFactor[];
  missing: string[];
  nextAction: string;
  services: Array<{ service: string; evidence: string[]; source: 'website' | 'proposal' | 'both' }>;
  sourceCount: number;
}
export interface MarketIntelligenceReport {
  period: GrowthPeriod;
  timezone: string;
  asOf: string;
  provenance: 'evidence_fallback';
  rules: {
    version: string;
    weights: { profileFit: number; opportunity: number; salesActivity: number; followUp: number };
    high: number;
    medium: number;
    minimumSignals: number;
  };
  minimumSample: number;
  priority: Array<{ category: PriorityCategory; count: number }>;
  excludedClosed: number;
  coverage: { leads: number; withProvider: number; withIndustry: number; sourcedIndustry: number; verifiedCountry: number; verifiedCity: number };
  industries: IndustryGroup[];
  locations: LocationGroup[];
  industryTrend: {
    series: Array<{ id: string; label: string }>;
    points: Array<GrowthPeriod & { counts: Record<string, number> }>;
  };
  recommendations: MarketRecommendation[];
}
