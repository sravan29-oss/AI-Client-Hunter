import type { PitchChannel, Prisma } from '@prisma/client';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../utils/errors';
import { campaignChannels, readCommunicationPolicy } from './engagementPolicy';

export const segmentSchema = z.object({
  country: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  industry: z.string().trim().min(1).max(100).optional(),
  minimumScore: z.number().int().min(0).max(100).default(0),
  qualifiedOnly: z.boolean().default(false),
}).strict();
export const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  channel: z.enum(campaignChannels),
  criteria: segmentSchema,
}).strict();

export function segmentWhere(criteria: z.output<typeof segmentSchema>): Prisma.LeadWhereInput {
  const { country, city, industry, minimumScore, qualifiedOnly } = criteria;
  return {
    ...(country ? { country: { equals: country, mode: 'insensitive' } } : {}),
    ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
    ...(industry ? { industry: { equals: industry, mode: 'insensitive' } } : {}),
    opportunityScore: { gte: minimumScore },
    leadStatus: { notIn: ['Archived', 'Rejected', 'Not_Interested', 'Lost', 'Won'] },
    ...(qualifiedOnly ? { OR: [{ leadStatus: 'Qualified' }, { qualificationStatus: 'QUALIFIED' }] } : {}),
  };
}

export async function requireCampaignMatch(
  db: Prisma.TransactionClient, campaignId: string, leadId: string, channel: PitchChannel, lock = false,
) {
  if (lock) await db.$queryRaw`SELECT "id" FROM "OutreachCampaign" WHERE "id" = ${campaignId} FOR SHARE`;
  const campaign = await db.outreachCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found.');
  if (campaign.archivedAt || campaign.channel !== channel) throw new ConflictError('Choose an active campaign with the same draft channel.');
  const lead = await db.lead.findFirst({ where: { id: leadId, ...segmentWhere(segmentSchema.parse(campaign.criteria)) } });
  if (!lead) throw new ConflictError('The lead no longer matches the campaign segment.');
  const policy = await readCommunicationPolicy(db, lead, channel, lock);
  if (!policy.approvalBasis) throw new ConflictError('The lead is ineligible for this campaign channel.', { reason: policy.state.reason });
}
