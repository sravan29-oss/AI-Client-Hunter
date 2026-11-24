import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { fingerprint, loadCommunicationLead, readCommunicationPolicy } from './engagementPolicy';
import { advanceLeadForPitch } from './salesActivity';
import { ConflictError, NotFoundError } from '../utils/errors';

export const responseKinds = ['INTERESTED', 'QUESTION', 'BUDGET', 'TIMING', 'NOT_INTERESTED', 'OPT_OUT', 'OTHER'] as const;
export const occurredAtSchema = z.iso.datetime({ offset: true }).refine(
  (value) => Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now(), 'Enter an event time that has already occurred.',
);
export const responseSchema = z.object({
  pitchId: z.string().min(1).max(120),
  kind: z.enum(responseKinds),
  summary: z.string().trim().min(3).max(1500),
  occurredAt: occurredAtSchema,
}).strict();

export async function logLeadResponse(leadId: string, input: z.output<typeof responseSchema>, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const pitchId = input.pitchId;
    await tx.$queryRaw`SELECT "id" FROM "Pitch" WHERE "id" = ${pitchId} FOR UPDATE`;
    const pitch = await tx.pitch.findUnique({ where: { id: pitchId } });
    if (!pitch || pitch.leadId !== leadId) throw new NotFoundError('Communication not found for this lead.');
    if (!pitch.sentAt || pitch.status === 'DRAFT' || Date.parse(input.occurredAt) < pitch.sentAt.getTime()) {
      throw new ConflictError('Record an actual response after the associated manual delivery.');
    }
    const occurredAt = new Date(input.occurredAt).toISOString();
    const sameResponse = input.summary.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
    const id = 'communication-response-' + fingerprint(pitchId, input.kind, sameResponse);
    const existing = await tx.activityLog.findUnique({ where: { id } });
    if (existing) return { response: existing, pitch };
    const lead = await loadCommunicationLead(tx, leadId, true);
    if (input.kind === 'OPT_OUT') {
      const delivery = await tx.activityLog.findFirst({ where: { action: 'OUTREACH_SENT', metadata: { path: ['pitchId'], equals: pitchId } } });
      const metadata = delivery?.metadata as { contactKey?: string } | null;
      const current = await readCommunicationPolicy(tx, lead, pitch.channel);
      if (metadata?.contactKey && current.contactKey === metadata.contactKey) {
        await readCommunicationPolicy(tx, lead, pitch.channel, true);
        await savePolicy(tx, leadId, pitch.channel, metadata.contactKey, 'OPTED_OUT', input.summary, actorId);
      } else {
        await savePolicy(tx, leadId, 'ALL', '', 'SUPPRESSED', input.summary, actorId);
        if (metadata?.contactKey) {
          await tx.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(hashtextextended(${metadata.contactKey}, 0::bigint))`;
          await savePolicy(tx, leadId, pitch.channel, metadata.contactKey, 'OPTED_OUT', input.summary, actorId);
        }
      }
    }
    const response = await tx.activityLog.create({ data: {
      id, action: 'COMMUNICATION_RESPONSE', description: 'Recorded a client response.',
      metadata: { leadId, pitchId, campaignId: pitch.campaignId, channel: pitch.channel, kind: input.kind,
        summary: input.summary, occurredAt, actorId, provenance: 'OPERATOR_RECORDED' },
    } });
    if (pitch.status !== 'SENT') return { response, pitch };
    const updated = await tx.pitch.update({ where: { id: pitchId }, data: { status: 'REPLIED' } });
    await advanceLeadForPitch(tx, updated, ['New', 'Analysed', 'Qualified', 'Reviewed', 'Ready_to_Contact', 'Contacted'], 'Replied');
    return { response, pitch: updated };
  });
}

export async function savePolicy(
  tx: Prisma.TransactionClient, leadId: string, scope: string, contactKey: string, status: string, evidence: string, actorId: string,
) {
  const key = { leadId, scope, contactKey };
  const previous = await tx.leadCommunicationPolicy.findUnique({ where: { leadId_scope_contactKey: key } });
  if (previous?.status === 'OPTED_OUT' && status === 'RESTRICTED') {
    throw new ConflictError('Keep the opt-out or record documented new consent to lift it.');
  }
  await tx.leadCommunicationPolicy.upsert({
    where: { leadId_scope_contactKey: key },
    create: { ...key, status, evidence },
    update: { status, evidence, revision: { increment: 1 } },
  });
  await tx.activityLog.create({ data: {
    action: 'COMMUNICATION_POLICY_UPDATED', description: 'Updated a communication policy.',
    metadata: { leadId, scope, status, previousStatus: previous?.status ?? 'UNKNOWN', actorId },
  } });
}
