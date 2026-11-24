import type { PitchStatus } from './index';

export type CampaignChannel = 'COLD_EMAIL' | 'WHATSAPP';
export type CommunicationChannel = CampaignChannel | 'LINKEDIN' | 'UPWORK_PROPOSAL';
export type ContactScope = 'ALL' | CommunicationChannel;
export type ContactStatus = 'GRANTED' | 'RESTRICTED' | 'OPTED_OUT' | 'SUPPRESSED' | 'CLEARED';
export type PolicyReason = 'ELIGIBLE' | 'CONSENT_REQUIRED' | 'SUPPRESSED' | 'OPTED_OUT' | 'RESTRICTED'
  | 'MISSING_CONTACT' | 'CLEAR' | 'UNSUPPORTED_DRAFT' | 'CAMPAIGN_INELIGIBLE';
export type ResponseKind = 'INTERESTED' | 'QUESTION' | 'BUDGET' | 'TIMING' | 'NOT_INTERESTED' | 'OPT_OUT' | 'OTHER';

export interface SegmentCriteria {
  country?: string;
  city?: string;
  industry?: string;
  minimumScore: number;
  qualifiedOnly: boolean;
}
export interface CampaignInput { name: string; channel: CampaignChannel; criteria: SegmentCriteria }
export interface OutreachCampaign extends CampaignInput { id: string; revision: number; archivedAt: string | null }
export interface CampaignPreview {
  matches: number;
  rows: Array<{
    id: string; businessName: string; city: string | null; country: string | null; industry: string;
    opportunityScore: number; reason: PolicyReason; draft: { id: string; status: PitchStatus } | null;
  }>;
}
export interface ContactPolicy {
  scope: ContactScope;
  status: ContactStatus | 'UNKNOWN';
  reason: PolicyReason;
  recipient: string | null;
  evidence: string | null;
  version: string;
  updatedAt: string | null;
}
export interface DraftEligibility { eligible: boolean; approved: boolean; reason: PolicyReason; updatedAt: string }
export interface LeadEngagement {
  policies: ContactPolicy[];
  timeline: Array<{
    id: string; action: string; description: string; createdAt: string; occurredAt: string | null;
    channel: ContactScope | null; detail: string | null; kind: ResponseKind | null;
  }>;
  drafts: Array<{
    id: string; channel: CommunicationChannel; messageType: string; subject: string | null; sentAt: string | null;
    status: PitchStatus; campaignId: string | null; createdAt: string;
  }>;
  recommendation: { kind: string; text: string; suggestionAt: string | null };
}
export interface EngagementMetrics {
  drafts: number;
  delivered: number;
  replied: number;
  won: number;
}
export interface EngagementPerformance {
  channels: Array<EngagementMetrics & { id: CommunicationChannel }>;
  campaigns: Array<EngagementMetrics & { id: string; name: string; archivedAt: string | null }>;
  objections: Array<{ kind: ResponseKind; count: number }>;
}
