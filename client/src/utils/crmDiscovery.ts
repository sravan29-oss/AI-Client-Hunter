import type { Lead, LeadStatus } from '../types';

export const LEAD_STATUSES: Array<{ key: LeadStatus; label: string }> = [
  'New', 'Qualified', 'Reviewed', 'Interested', 'Not_Interested', 'Analysed', 'Ready_to_Contact', 'Contacted',
  'Replied', 'Meeting_Scheduled', 'Negotiation', 'Won', 'Lost', 'Rejected', 'Archived',
].map((status) => ({ key: status as LeadStatus, label: status.replace(/_/g, ' ') }));

export const websiteStatusLabels = {
  ANALYZED: 'Analyzed', FAILED: 'Inspection failed', NOT_LISTED: 'Website not listed', UNKNOWN: 'Unknown',
} as const;

export const initialDiscoveryFilters = { city: '', provider: '', website: '', qualification: '', score: '', discoveredAfter: '' };
export type DiscoveryFilters = typeof initialDiscoveryFilters;

export function matchesDiscoveryFilters(lead: Lead, filters: DiscoveryFilters) {
  if (filters.city && lead.city !== filters.city) return false;
  if (filters.provider && lead.source !== filters.provider && !lead.discoverySources?.some((source) => source.providerId === filters.provider)) return false;
  if (filters.website && (lead.websiteAnalysisStatus ?? 'UNKNOWN') !== filters.website) return false;
  if (filters.qualification && (lead.qualificationStatus ?? 'UNASSESSED') !== filters.qualification) return false;
  if (filters.score && (lead.opportunityScore === undefined || lead.opportunityScore < Number(filters.score))) return false;
  if (filters.discoveredAfter && (!lead.discoveryDate || lead.discoveryDate.slice(0, 10) < filters.discoveredAfter)) return false;
  return true;
}
