import type { LeadStatus, Prisma } from '@prisma/client';
import { ConflictError } from '../utils/errors';

export async function recordLeadStage(
  tx: Prisma.TransactionClient, leadId: string, from: LeadStatus, to: LeadStatus, pitchId?: string,
) {
  if (from === to) return;
  await tx.activityLog.create({
    data: {
      action: 'STATUS_CHANGED',
      description: `Moved lead from ${from.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}.`,
      metadata: { leadId, from, to, ...(pitchId ? { pitchId } : {}) },
    },
  });
}

export async function advanceLeadForPitch(
  tx: Prisma.TransactionClient,
  pitch: { id: string; leadId: string | null },
  from: LeadStatus[],
  to: LeadStatus,
) {
  if (!pitch.leadId) return;
  const id = pitch.leadId;
  await tx.$queryRaw`SELECT "id" FROM "Lead" WHERE "id" = ${id} FOR NO KEY UPDATE`;
  const lead = await tx.lead.findUnique({ where: { id }, select: { leadStatus: true } });
  if (!lead || lead.leadStatus === to) return;
  if (!from.includes(lead.leadStatus)) {
    if (to === 'Won') throw new ConflictError('Reopen the linked lead in the CRM before recording a win.');
    return;
  }
  await tx.lead.update({ where: { id }, data: { leadStatus: to } });
  await recordLeadStage(tx, id, lead.leadStatus, to, pitch.id);
}
