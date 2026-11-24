import type { ContactScope, ContactStatus, PolicyReason, ResponseKind } from '../types/engagement';

export const channelLabels: Record<ContactScope, string> = {
  ALL: 'All channels', COLD_EMAIL: 'Email', WHATSAPP: 'WhatsApp', LINKEDIN: 'LinkedIn', UPWORK_PROPOSAL: 'Proposal platform',
};
export const statusLabels: Record<ContactStatus | 'UNKNOWN', string> = {
  GRANTED: 'Consent recorded', RESTRICTED: 'Restricted', OPTED_OUT: 'Opted out', SUPPRESSED: 'Suppressed',
  CLEARED: 'Lead-wide stop cleared', UNKNOWN: 'Unrecorded',
};
export const eligibilityLabels: Record<PolicyReason, string> = {
  ELIGIBLE: 'Eligible', CONSENT_REQUIRED: 'Consent required', SUPPRESSED: 'Lead-wide stop active', OPTED_OUT: 'Recipient opted out',
  RESTRICTED: 'Channel restricted', MISSING_CONTACT: 'Missing valid recipient', CLEAR: 'No lead-wide stop',
  UNSUPPORTED_DRAFT: 'A supported channel and a saved CRM lead are required', CAMPAIGN_INELIGIBLE: 'Campaign or segment changed',
};
export const responseLabels: Record<ResponseKind, string> = {
  INTERESTED: 'Interested', QUESTION: 'Question', BUDGET: 'Budget objection', TIMING: 'Timing objection',
  NOT_INTERESTED: 'Declined', OPT_OUT: 'Opt-out request', OTHER: 'Other response',
};

export function policyChoices(scope: ContactScope): ContactStatus[] {
  return scope === 'ALL' ? ['SUPPRESSED', 'CLEARED'] : ['GRANTED', 'RESTRICTED', 'OPTED_OUT'];
}

export function pastEventInstant(value: string, now = new Date()) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date <= now ? date.toISOString() : undefined;
}

export const engagementField = 'w-full rounded-lg border border-slate-700 bg-navy-950 px-3 py-2 text-sm text-white [color-scheme:dark]';
export const engagementButton = 'rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-electric-400 disabled:opacity-50';
