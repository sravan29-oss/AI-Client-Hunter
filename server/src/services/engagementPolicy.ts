import { createHash } from 'node:crypto';
import type { Pitch, PitchChannel, Prisma } from '@prisma/client';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../utils/errors';

export const communicationChannels = ['COLD_EMAIL', 'WHATSAPP', 'LINKEDIN', 'UPWORK_PROPOSAL'] as const;
export const campaignChannels = ['COLD_EMAIL', 'WHATSAPP'] as const;
type Scope = PitchChannel | 'ALL';
type Contact = { id: string; businessEmail: string | null; publicBusinessPhone: string | null };

export function fingerprint(...parts: Array<string | null>) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function contactAddress(lead: Contact, channel: Scope) {
  if (channel === 'ALL' || channel === 'LINKEDIN' || channel === 'UPWORK_PROPOSAL') return null;
  const email = lead.businessEmail?.trim().toLowerCase();
  const number = lead.publicBusinessPhone?.trim().replace(/[ ().-]/g, '');
  if (channel === 'COLD_EMAIL') return z.email().safeParse(email).data ?? null;
  return number && /^\+[1-9]\d{7,14}$/.test(number) ? number : null;
}

function policyContactKey(scope: Scope, address: string | null) {
  return address ? fingerprint(scope, address) : '';
}

export async function loadCommunicationLead(db: Prisma.TransactionClient, id: string, lock = false) {
  if (lock) await db.$queryRaw`SELECT "id" FROM "Lead" WHERE "id" = ${id} FOR NO KEY UPDATE`;
  const lead = await db.lead.findUnique({
    where: { id },
    select: { id: true, businessName: true, businessEmail: true, publicBusinessPhone: true, leadStatus: true },
  });
  if (!lead) throw new NotFoundError('Lead not found.');
  return lead;
}

export async function readCommunicationPolicy(db: Prisma.TransactionClient, lead: Contact, scope: Scope, lock = false) {
  const recipient = contactAddress(lead, scope);
  const contactKey = policyContactKey(scope, recipient);
  if (lock && contactKey) await db.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(hashtextextended(${contactKey}, 0::bigint))`;
  const [local, stop, sharedPolicies] = await Promise.all([
    db.leadCommunicationPolicy.findFirst({ where: { leadId: lead.id, scope, contactKey } }),
    scope === 'ALL' ? null : db.leadCommunicationPolicy.findFirst({ where: { leadId: lead.id, scope: 'ALL', contactKey: '' } }),
    contactKey ? db.leadCommunicationPolicy.findMany({
      where: { scope, contactKey, OR: [{ leadId: null }, { leadId: { not: lead.id } }] },
      orderBy: { id: 'asc' },
      select: { id: true, revision: true, status: true },
    }) : [],
  ]);
  const missing = !recipient && (scope === 'COLD_EMAIL' || scope === 'WHATSAPP');
  const status = local?.status ?? 'UNKNOWN';
  const reason = stop?.status === 'SUPPRESSED' || status === 'SUPPRESSED' ? 'SUPPRESSED'
    : status === 'OPTED_OUT' || sharedPolicies.some((policy) => policy.status === 'OPTED_OUT') ? 'OPTED_OUT'
    : status === 'RESTRICTED' ? 'RESTRICTED'
    : missing ? 'MISSING_CONTACT'
    : scope === 'ALL' ? 'CLEAR'
    : status === 'GRANTED' ? 'ELIGIBLE' : 'CONSENT_REQUIRED';
  const version = fingerprint(lead.id, scope, contactKey, local?.id ?? null, String(local?.revision ?? -1),
    stop?.id ?? null, String(stop?.revision ?? -1), reason, JSON.stringify(sharedPolicies));
  return {
    approvalBasis: reason === 'ELIGIBLE' ? version : null,
    contactKey,
    state: {
      scope, status, reason, recipient, version,
      evidence: local?.evidence ?? null, updatedAt: local?.updatedAt ?? null,
    },
  };
}

export async function assessDraft(db: Prisma.TransactionClient, pitch: Pick<Pitch, 'leadId' | 'channel' | 'messageType' | 'approvalBasis' | 'approvedAt'>, lock = false) {
  if (!pitch.leadId || pitch.messageType === 'INSTAGRAM_DM') {
    return { eligible: false, approved: false, reason: 'UNSUPPORTED_DRAFT', contactKey: '', basis: null };
  }
  const lead = await loadCommunicationLead(db, pitch.leadId, lock);
  const policy = await readCommunicationPolicy(db, lead, pitch.channel, lock);
  return {
    eligible: !!policy.approvalBasis,
    approved: Boolean(policy.approvalBasis && pitch.approvedAt && pitch.approvalBasis === policy.approvalBasis),
    reason: policy.state.reason,
    contactKey: policy.contactKey,
    basis: policy.approvalBasis,
  };
}

export function requireCurrentApproval(state: Awaited<ReturnType<typeof assessDraft>>) {
  if (!state.eligible) throw new ConflictError('This draft is ineligible under the current contact policy.', { reason: state.reason });
  if (!state.approved) throw new ConflictError('Approve the saved draft under the current contact policy first.');
}
