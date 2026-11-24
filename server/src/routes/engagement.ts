import { Router } from 'express';
import { z } from 'zod';
import { prisma, isDatabaseConnected } from '../db/prisma';
import { requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { campaignSchema, segmentSchema, segmentWhere } from '../services/outreachCampaigns';
import { communicationChannels, loadCommunicationLead, readCommunicationPolicy } from '../services/engagementPolicy';
import { logLeadResponse, responseSchema, savePolicy } from '../services/engagementActivity';
import { AppError, ConflictError, NotFoundError } from '../utils/errors';

const router = Router();
const operator = requireRole(['admin', 'developer']);
const scopes = ['ALL', ...communicationChannels] as const;
const policySchema = z.object({
  scope: z.enum(scopes),
  status: z.enum(['GRANTED', 'RESTRICTED', 'OPTED_OUT', 'SUPPRESSED', 'CLEARED']),
  evidence: z.string().trim().min(5).max(1000),
  version: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine(
  ({ scope, status }) => (scope === 'ALL') === ['SUPPRESSED', 'CLEARED'].includes(status),
  'Select a status for the chosen policy scope.',
);
const campaignEditSchema = campaignSchema.extend({
  revision: z.number().int().nonnegative(),
  archived: z.boolean(),
}).strict();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next(isDatabaseConnected ? undefined : new AppError('Engagement management requires PostgreSQL.', 503));
});

router.get('/campaigns', async (_req, res, next) => {
  try {
    const data = await prisma.outreachCampaign.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.post('/campaigns', operator, validateRequest({ body: campaignSchema }), async (req, res, next) => {
  try {
    const data = await prisma.outreachCampaign.create({ data: req.body });
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
});

router.put('/campaigns/:id', operator, validateRequest({ body: campaignEditSchema }), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { revision, archived, ...input }: z.output<typeof campaignEditSchema> = req.body;
    const data = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "OutreachCampaign" WHERE "id" = ${id} FOR UPDATE`;
      const previous = await tx.outreachCampaign.findUnique({ where: { id } });
      if (!previous) throw new NotFoundError('Campaign not found.');
      if (previous.revision !== revision) throw new ConflictError('Reload the campaign before editing it.');
      if (previous.channel !== input.channel && await tx.pitch.count({ where: { campaignId: id } }) > 0) {
        throw new ConflictError('Create a new campaign to use another channel for these leads.');
      }
      return tx.outreachCampaign.update({ where: { id }, data: {
        ...input, archivedAt: archived ? previous.archivedAt ?? new Date() : null, revision: { increment: 1 },
      } });
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.get('/campaigns/:id/segment', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const campaign = await prisma.outreachCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundError('Campaign not found.');
    const where = segmentWhere(segmentSchema.parse(campaign.criteria));
    const [matches, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({ where, take: 100, orderBy: [{ opportunityScore: 'desc' }, { id: 'asc' }], select: {
        id: true, businessName: true, city: true, country: true, industry: true, opportunityScore: true,
        businessEmail: true, publicBusinessPhone: true,
        pitches: { where: { campaignId: id }, select: { id: true, status: true } },
      } }),
    ]);
    const rows = [];
    for (const lead of leads) {
      const policy = await readCommunicationPolicy(prisma, lead, campaign.channel);
      const { businessEmail: _email, publicBusinessPhone: _phone, pitches, ...summary } = lead;
      rows.push({ ...summary, reason: policy.state.reason, draft: pitches[0] ?? null });
    }
    res.json({ success: true, data: { matches, rows } });
  } catch (error) { next(error); }
});

const timelineActions = [
  'OUTREACH_DRAFTED', 'PROPOSAL_DRAFTED', 'DRAFT_APPROVED', 'OUTREACH_SENT', 'OUTREACH_REPLY_RECORDED',
  'OUTREACH_CONVERSION_RECORDED', 'COMMUNICATION_POLICY_UPDATED', 'COMMUNICATION_RESPONSE',
  'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_RESCHEDULED', 'FOLLOW_UP_COMPLETED', 'FOLLOW_UP_CANCELLED',
];

router.get('/leads/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const lead = await loadCommunicationLead(prisma, id);
    const [policies, events, drafts, pending, recentDelivery] = await Promise.all([
      Promise.all(scopes.map(async (scope) => (await readCommunicationPolicy(prisma, lead, scope)).state)),
      prisma.activityLog.findMany({ where: { action: { in: timelineActions }, metadata: { path: ['leadId'], equals: id } },
        take: 75, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      prisma.pitch.findMany({ where: { leadId: id }, take: 100, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: {
        id: true, channel: true, messageType: true, subject: true, sentAt: true, status: true, campaignId: true, createdAt: true,
      } }),
      prisma.leadFollowUp.findFirst({ where: { leadId: id, status: 'PENDING' }, orderBy: { dueAt: 'asc' }, select: { title: true, dueAt: true } }),
      prisma.pitch.findFirst({ where: { leadId: id, sentAt: { not: null } }, orderBy: { sentAt: 'desc' },
        select: { id: true, channel: true, messageType: true, sentAt: true } }),
    ]);
    const timeline = events.map((event) => {
      const metadata = (event.metadata ?? {}) as Record<string, unknown>;
      return {
        id: event.id, action: event.action, description: event.description, createdAt: event.createdAt,
        occurredAt: typeof metadata.occurredAt === 'string' ? metadata.occurredAt : null,
        channel: metadata.channel ?? metadata.scope ?? null,
        detail: metadata.summary ?? metadata.status ?? null,
        kind: metadata.kind ?? null,
      };
    }).sort((a, b) => (b.occurredAt ?? b.createdAt.toISOString()).localeCompare(a.occurredAt ?? a.createdAt.toISOString()));
    const response = timeline.filter((event) => event.action === 'COMMUNICATION_RESPONSE' && event.occurredAt)
      .sort((a, b) => b.occurredAt!.localeCompare(a.occurredAt!))[0];
    const recentPolicy = policies.find((policy) => policy.scope === recentDelivery?.channel);
    const anyEligible = policies.some((policy) => policy.reason === 'ELIGIBLE');
    let recommendation = { kind: 'REVIEW', text: 'Review the recorded activity and prepare a draft if appropriate.', suggestionAt: null as string | null };
    if (!anyEligible || (recentDelivery && (recentPolicy?.reason !== 'ELIGIBLE' || recentDelivery.messageType === 'INSTAGRAM_DM'))) {
      recommendation = { kind: 'HOLD', text: 'Hold outreach while the applicable contact policy is ineligible.', suggestionAt: null };
    } else if (['Won', 'Lost', 'Archived', 'Rejected', 'Not_Interested'].includes(lead.leadStatus)) {
      recommendation = { kind: 'HOLD', text: 'Review the closed CRM stage before planning further outreach.', suggestionAt: null };
    } else if (pending) {
      recommendation = { kind: 'SCHEDULED', text: `A reminder is already scheduled: ${pending.title}.`, suggestionAt: pending.dueAt.toISOString() };
    } else if (response?.kind === 'NOT_INTERESTED' || response?.kind === 'OPT_OUT') {
      recommendation = { kind: 'HOLD', text: 'The latest recorded response requests no further outreach or declines the offer.', suggestionAt: null };
    } else if (response?.occurredAt && (!recentDelivery?.sentAt || Date.parse(response.occurredAt) >= recentDelivery.sentAt.getTime())) {
      recommendation = { kind: 'REVIEW_REPLY', text: 'Review the actual reply before planning a follow-up.', suggestionAt: null };
    } else if (recentDelivery?.sentAt) {
      recommendation = { kind: 'REVIEW_FOLLOW_UP', text: 'Review a possible follow-up based on the last recorded manual delivery.',
        suggestionAt: new Date(recentDelivery.sentAt.getTime() + 3 * 86_400_000).toISOString() };
    }
    res.json({ success: true, data: { policies, timeline, drafts, recommendation } });
  } catch (error) { next(error); }
});

router.put('/leads/:id/policy', operator, validateRequest({ body: policySchema }), async (req, res, next) => {
  try {
    const leadId = String(req.params.id);
    const { scope, status, evidence, version }: z.output<typeof policySchema> = req.body;
    const data = await prisma.$transaction(async (tx) => {
      const lead = await loadCommunicationLead(tx, leadId, true);
      const policy = await readCommunicationPolicy(tx, lead, scope, true);
      if (policy.state.version !== version) throw new ConflictError('Reload the contact policy before changing it.');
      if (['COLD_EMAIL', 'WHATSAPP'].includes(scope) && !policy.state.recipient) {
        throw new ConflictError('Add a valid recipient to the lead before setting a policy for this channel.');
      }
      await savePolicy(tx, leadId, scope, policy.contactKey, status, evidence, req.user!.id);
      return (await readCommunicationPolicy(tx, lead, scope)).state;
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.post('/leads/:id/responses', operator, validateRequest({ body: responseSchema }), async (req, res, next) => {
  try {
    const data = await logLeadResponse(String(req.params.id), req.body, req.user!.id);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

export default router;
