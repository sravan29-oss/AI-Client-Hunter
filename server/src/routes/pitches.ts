import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { OutreachMessageType } from '../services/gemini';
import { generateProfileOutreach } from '../services/profileOutreach';
import { prisma, isDatabaseConnected, memoryStore } from '../db/prisma';
import { validateRequest } from '../middleware/validate';
import { NotFoundError, AppError, BadRequestError, ConflictError } from '../utils/errors';
import { advanceLeadForPitch } from '../services/salesActivity';
import { requireRole } from '../middleware/auth';
import type { LeadStatus, Pitch, Prisma } from '@prisma/client';
import { assessDraft, fingerprint, loadCommunicationLead, requireCurrentApproval } from '../services/engagementPolicy';
import { occurredAtSchema } from '../services/engagementActivity';
import { requireCampaignMatch } from '../services/outreachCampaigns';


const router = Router();
const writeAccess = requireRole(['admin', 'developer']);
const revisionSchema = z.object({ updatedAt: z.iso.datetime({ offset: true }) }).strict();
const deliverySchema = revisionSchema.extend({ confirmed: z.literal(true), occurredAt: occurredAtSchema }).strict();
const earlyStages: LeadStatus[] = ['New', 'Analysed', 'Qualified', 'Reviewed', 'Ready_to_Contact'];
const conversionStages: LeadStatus[] = [...earlyStages, 'Contacted', 'Replied', 'Interested', 'Meeting_Scheduled', 'Negotiation'];

const generateOutreachSchema = z.object({
  leadId: z.string().trim().min(1).max(120).optional(),
  campaignId: z.string().uuid().optional(),
  companyName: z.string().trim().min(1, 'Company name is required').max(300),
  contactName: z.string().max(300).optional(),
  websiteUrl: z.string().max(2048).optional(),
  industry: z.string().max(300).optional(),
  city: z.string().max(300).optional(),
  country: z.string().max(300).optional(),
  targetService: z.string().trim().min(1, 'Target service is required').max(300),
  targetRegion: z.enum(['INDIA', 'US', 'UK', 'EUROPE', 'OTHER']).optional().default('INDIA'),
  messageType: z
    .enum([
      'COLD_EMAIL',
      'WHATSAPP_MESSAGE',
      'LINKEDIN_CONNECT',
      'LINKEDIN_FOLLOWUP',
      'INSTAGRAM_DM',
      'FREELANCE_PROPOSAL',
      'PROJECT_INTRO',
      'FOLLOW_UP',
    ])
    .optional()
    .default('COLD_EMAIL'),
  channel: z.enum(['COLD_EMAIL', 'LINKEDIN', 'WHATSAPP', 'UPWORK_PROPOSAL']).optional(),
  tone: z.string().max(80).optional().default('professional_friendly'),
  pitchHooks: z.array(z.string().max(1000)).max(50).optional(),
  verifiedProblems: z.array(z.string().max(1000)).max(50).optional(),
  auditSummary: z.string().max(12000).optional(),
  freelancerName: z.string().max(300).optional(),
});

const updatePitchSchema = z.object({
  subject: z.string().max(500).optional(),
  body: z.string().trim().min(1).max(12000).optional(),
  personalisedOpening: z.string().max(3000).optional(),
  observedOpportunity: z.string().max(3000).optional(),
  relevantService: z.string().max(3000).optional(),
  valueProposition: z.string().max(3000).optional(),
  callToAction: z.string().max(3000).optional(),
  professionalClosing: z.string().max(3000).optional(),
  status: z.enum(['DRAFT', 'SENT', 'REPLIED', 'CONVERTED']).optional(),
  tone: z.string().max(80).optional(),
  updatedAt: z.iso.datetime({ offset: true }).optional(),
}).strict();

function mapMessageTypeToChannel(type: OutreachMessageType): Pitch['channel'] {
  switch (type) {
    case 'LINKEDIN_CONNECT':
    case 'LINKEDIN_FOLLOWUP':
      return 'LINKEDIN';
    case 'INSTAGRAM_DM':
    case 'WHATSAPP_MESSAGE':
      return 'WHATSAPP';
    case 'FREELANCE_PROPOSAL':
      return 'UPWORK_PROPOSAL';
    case 'COLD_EMAIL':
    case 'PROJECT_INTRO':
    case 'FOLLOW_UP':
    default:
      return 'COLD_EMAIL';
  }
}

// POST /api/pitches/generate - AI Outreach Generator
router.post('/generate', writeAccess, validateRequest({ body: generateOutreachSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload: z.output<typeof generateOutreachSchema> = req.body;
    const messageType = payload.messageType || 'COLD_EMAIL';
    const channel = mapMessageTypeToChannel(messageType);
    if (payload.channel && payload.channel !== channel) throw new BadRequestError('The message format must match its channel.');
    if (payload.campaignId && (!payload.leadId || !isDatabaseConnected)) {
      throw new BadRequestError('Campaign drafts require a saved lead and PostgreSQL.');
    }
    const leadId = payload.leadId;
    const existingDraft: Prisma.PitchWhereInput | undefined = !leadId ? undefined : payload.campaignId
      ? { leadId, campaignId: payload.campaignId }
      : { leadId, campaignId: null, status: 'DRAFT', channel, messageType,
        targetService: { equals: payload.targetService, mode: 'insensitive' } };

    // If leadId is provided, pull fresh lead data and latest audit to ensure 100% verified facts
    let verifiedProblems = payload.verifiedProblems || payload.pitchHooks || [];
    let auditSummary = payload.auditSummary;
    let { industry, country, city, companyName, contactName, websiteUrl } = payload;

    if (payload.leadId && isDatabaseConnected) {
      const dbLead = await prisma.lead.findUnique({
        where: { id: payload.leadId },
        include: { audits: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      if (!dbLead) throw new NotFoundError('Lead not found.');
      if (payload.campaignId) await requireCampaignMatch(prisma, payload.campaignId, dbLead.id, channel);
      if (existingDraft) {
        const existing = await prisma.pitch.findFirst({ where: existingDraft, include: { lead: true } });
        if (existing) {
          res.json({ success: true, data: existing, duplicate: true });
          return;
        }
      }
      companyName = dbLead.businessName;
      contactName = dbLead.contactName ?? undefined;
      websiteUrl = dbLead.website ?? undefined;
      city = dbLead.city ?? undefined;
      country = dbLead.country ?? undefined;
      industry = dbLead.industry;
      verifiedProblems = dbLead.detectedProblems;
      auditSummary = dbLead.audits[0]?.summary ?? undefined;
    }

    const generated = await generateProfileOutreach({
      leadId: payload.leadId,
      companyName,
      contactName,
      websiteUrl,
      industry,
      city,
      country,
      targetService: payload.targetService,
      targetRegion: payload.targetRegion,
      messageType,
      tone: payload.tone,
      verifiedProblems,
      auditSummary,
      freelancerName: payload.freelancerName,
    });

    if (!generated.body?.trim()) throw new AppError('Outreach generation returned an empty draft.', 502);

    const pitchRecord = {
      leadId: payload.leadId || null,
      campaignId: payload.campaignId ?? null,
      channel,
      messageType,
      targetService: payload.targetService,
      targetRegion: payload.targetRegion,
      subject: generated.subject || `${payload.targetService} for ${companyName}`,
      body: generated.body,
      personalisedOpening: generated.personalisedOpening,
      observedOpportunity: generated.observedOpportunity,
      relevantService: generated.relevantService,
      valueProposition: generated.valueProposition,
      callToAction: generated.callToAction,
      professionalClosing: generated.professionalClosing,
      followUpSequence: (generated.followUpSequence || []) as any,
      tone: payload.tone || 'professional_friendly',
      status: 'DRAFT' as const,
      metadata: {
        verifiedProblems,
        auditSummary: auditSummary || null,
        generatedBy: generated.generatedBy,
        model: generated.model,
        isFallback: generated.isFallback,
        businessProfile: generated.businessProfile,
      },
    };

    if (isDatabaseConnected) {
      const { saved, duplicate } = await prisma.$transaction(async (tx) => {
        if (existingDraft && leadId) {
          await loadCommunicationLead(tx, leadId, true);
          if (payload.campaignId) await requireCampaignMatch(tx, payload.campaignId, leadId, channel, true);
          const existing = await tx.pitch.findFirst({ where: existingDraft, include: { lead: true } });
          if (existing) return { saved: existing, duplicate: true };
        }
        const draft = await tx.pitch.create({ data: pitchRecord });
        await advanceLeadForPitch(tx, draft, ['New', 'Analysed', 'Qualified', 'Reviewed'], 'Ready_to_Contact');
        await tx.activityLog.create({ data: {
          action: 'OUTREACH_DRAFTED', description: 'Created an outreach draft.',
          metadata: { pitchId: draft.id, leadId: draft.leadId, campaignId: draft.campaignId, channel, generatedBy: generated.generatedBy },
        } });
        return { saved: await tx.pitch.findUniqueOrThrow({ where: { id: draft.id }, include: { lead: true } }), duplicate: false };
      });

      res.status(duplicate ? 200 : 201).json({
        success: true,
        data: saved,
        duplicate,
      });
      return;
    }

    // In-memory fallback
    const fallbackPitch = {
      id: 'pitch-' + Date.now(),
      ...pitchRecord,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryStore.pitches.unshift(fallbackPitch);

    if (payload.leadId) {
      const lead = memoryStore.leads.find((l) => l.id === payload.leadId);
      if (lead && (lead.leadStatus === 'New' || lead.leadStatus === 'Analysed')) {
        lead.leadStatus = 'Ready_to_Contact';
      }
      if (lead) {
        if (!lead.pitches) lead.pitches = [];
        lead.pitches.unshift(fallbackPitch);
      }
    }

    res.status(201).json({
      success: true,
      data: fallbackPitch,
      generatedBy: generated.generatedBy,
        model: generated.model,
      isFallback: generated.isFallback,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/pitches - List outreach history with optional filters
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { leadId, channel, messageType, status } = req.query as any;

    if (isDatabaseConnected) {
      const where: any = {};
      if (leadId) where.leadId = leadId;
      if (channel) where.channel = channel;
      if (messageType) where.messageType = messageType;
      if (status) where.status = status;

      const pitches = await prisma.pitch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: {
            select: {
              id: true,
              businessName: true,
              country: true,
              website: true,
              industry: true,
              leadStatus: true,
            },
          },
        },
      });

      res.json({ success: true, count: pitches.length, data: pitches });
      return;
    }

    let list = [...memoryStore.pitches];
    if (leadId) list = list.filter((p) => p.leadId === leadId);
    if (channel) list = list.filter((p) => p.channel === channel);
    if (messageType) list = list.filter((p) => (p as any).messageType === messageType);
    if (status) list = list.filter((p) => p.status === status);

    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    next(err);
  }
});

// GET /api/pitches/:id - Get a single outreach draft
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    if (isDatabaseConnected) {
      const pitch = await prisma.pitch.findUnique({
        where: { id },
        include: {
          lead: {
            select: {
              id: true,
              businessName: true,
              country: true,
              website: true,
              industry: true,
              leadStatus: true,
            },
          },
        },
      });

      if (!pitch) throw new NotFoundError(`Outreach draft with ID ${id} not found.`);
      res.json({ success: true, data: pitch });
      return;
    }

    const item = memoryStore.pitches.find((p) => p.id === id);
    if (!item) throw new NotFoundError(`Outreach draft with ID ${id} not found.`);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

function pitchEdit(pitch: Pitch, payload: z.infer<typeof updatePitchSchema>) {
  const { status, updatedAt, ...content } = payload;
  const editing = Object.keys(content).length > 0;
  if (updatedAt && new Date(updatedAt).getTime() !== new Date(pitch.updatedAt).getTime()) {
    throw new ConflictError('This draft changed. Reload it before continuing.');
  }
  if (editing && (pitch.status !== 'DRAFT' || pitch.proposal)) {
    throw new ConflictError('Only unsent outreach text can be edited. Create a new estimate to revise a proposal.');
  }
  if (status === 'SENT') throw new BadRequestError('Use Record manual send to log delivery.');
  if (status && status !== pitch.status) {
    if (status === 'REPLIED') throw new ConflictError('Record the actual client response through Engagement.');
    const allowed = (pitch.status === 'SENT' || pitch.status === 'REPLIED') && status === 'CONVERTED';
    if (!allowed || editing) throw new ConflictError('That outreach status transition is unavailable.');
  }
  return { ...content, ...(editing ? { approvedAt: null, approvalBasis: null } : {}), status: status === pitch.status ? undefined : status };
}

router.put('/:id', writeAccess, validateRequest({ body: updatePitchSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    if (isDatabaseConnected) {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Pitch" WHERE "id" = ${id} FOR UPDATE`;
        const pitch = await tx.pitch.findUnique({ where: { id } });
        if (!pitch) throw new NotFoundError('Outreach draft not found.');
        const data = pitchEdit(pitch, req.body);
        const next = await tx.pitch.update({ where: { id }, data });
        if (data.status) {
          await advanceLeadForPitch(tx, next, conversionStages, 'Won');
          await tx.activityLog.create({ data: {
            action: 'OUTREACH_CONVERSION_RECORDED',
            description: 'Recorded a conversion.',
            metadata: { pitchId: id, leadId: next.leadId, campaignId: next.campaignId, channel: next.channel, from: pitch.status, to: next.status },
          } });
        }
        return tx.pitch.findUniqueOrThrow({ where: { id }, include: { lead: true } });
      });
      res.json({ success: true, data: updated });
      return;
    }

    const index = memoryStore.pitches.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new NotFoundError(`Outreach draft with ID ${id} not found.`);
    }

    const data = pitchEdit(memoryStore.pitches[index], req.body);
    if (!data.status) delete data.status;
    memoryStore.pitches[index] = {
      ...memoryStore.pitches[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    res.json({ success: true, data: memoryStore.pitches[index] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/eligibility', async (req, res, next) => {
  try {
    if (!isDatabaseConnected) throw new AppError('Contact policy requires PostgreSQL.', 503);
    const pitch = await prisma.pitch.findUnique({ where: { id: String(req.params.id) } });
    if (!pitch) throw new NotFoundError('Outreach draft not found.');
    const { eligible, approved, reason } = await assessDraft(prisma, pitch);
    if (eligible && pitch.campaignId && pitch.leadId) {
      try {
        await requireCampaignMatch(prisma, pitch.campaignId, pitch.leadId, pitch.channel);
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data: { eligible: false, approved: false, reason: 'CAMPAIGN_INELIGIBLE', updatedAt: pitch.updatedAt } });
        return;
      }
    }
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { eligible, approved, reason, updatedAt: pitch.updatedAt } });
  } catch (error) { next(error); }
});

router.post('/:id/approve', writeAccess, validateRequest({ body: revisionSchema }), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const revision = new Date(req.body.updatedAt);
    const verify = (pitch: Pitch | null) => {
      if (!pitch) throw new NotFoundError('Outreach draft not found.');
      if (pitch.status !== 'DRAFT' || new Date(pitch.updatedAt).getTime() !== revision.getTime()) {
        throw new ConflictError('Reload the current unsent draft before approving it.');
      }
      return pitch;
    };
    if (!isDatabaseConnected) throw new AppError('Draft approval requires PostgreSQL.', 503);
    const data = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Pitch" WHERE "id" = ${id} FOR UPDATE`;
      const pitch = verify(await tx.pitch.findUnique({ where: { id }, include: { lead: true } }));
      const state = await assessDraft(tx, pitch, true);
      if (!state.eligible) throw new ConflictError('This draft is ineligible under the current contact policy.', { reason: state.reason });
      if (pitch.campaignId && pitch.leadId) await requireCampaignMatch(tx, pitch.campaignId, pitch.leadId, pitch.channel, true);
      if (state.approved) return pitch;
      const updated = await tx.pitch.update({
        where: { id }, data: { approvedAt: new Date(), approvalBasis: state.basis }, include: { lead: true },
      });
      await tx.activityLog.create({ data: {
        action: 'DRAFT_APPROVED', description: 'Approved a draft for manual use.',
        metadata: { pitchId: id, leadId: updated.leadId, campaignId: updated.campaignId, channel: updated.channel, actorId: req.user!.id },
      } });
      return updated;
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/mark-sent', writeAccess, validateRequest({ body: deliverySchema }), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!isDatabaseConnected) throw new AppError('Delivery recording requires PostgreSQL.', 503);
    const { updatedAt, occurredAt }: z.output<typeof deliverySchema> = req.body;
    const data = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Pitch" WHERE "id" = ${id} FOR UPDATE`;
      const pitch = await tx.pitch.findUnique({ where: { id }, include: { lead: true } });
      if (!pitch) throw new NotFoundError('Outreach draft not found.');
      if (pitch.status !== 'DRAFT') return pitch;
      if (Date.parse(updatedAt) !== pitch.updatedAt.getTime()) throw new ConflictError('Reload the current draft before recording delivery.');
      const state = await assessDraft(tx, pitch, true);
      requireCurrentApproval(state);
      if (pitch.campaignId && pitch.leadId) await requireCampaignMatch(tx, pitch.campaignId, pitch.leadId, pitch.channel, true);
      const sentAt = new Date(occurredAt);
      if (pitch.approvedAt && sentAt < pitch.approvedAt) {
        throw new ConflictError('Delivery must have occurred after the current approval.');
      }
      const normalize = (value: string | null) => value?.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() ?? '';
      const subject = pitch.channel === 'WHATSAPP' ? '' : normalize(pitch.subject);
      const eventId = 'communication-delivery-' + fingerprint(state.contactKey || pitch.leadId, pitch.channel, subject, normalize(pitch.body));
      const previous = await tx.pitch.findMany({
        where: { id: { not: id }, leadId: pitch.leadId, channel: pitch.channel, sentAt: { not: null } },
        select: { subject: true, body: true },
      });
      if (previous.some((item) => (pitch.channel === 'WHATSAPP' || normalize(item.subject) === subject)
        && normalize(item.body) === normalize(pitch.body))) {
        throw new ConflictError('This communication already has a manual delivery record.');
      }
      const logged = await tx.activityLog.createMany({ data: {
        id: eventId, action: 'OUTREACH_SENT', description: 'Recorded manual delivery.',
        metadata: { pitchId: id, leadId: pitch.leadId, campaignId: pitch.campaignId, channel: pitch.channel,
          occurredAt: sentAt.toISOString(), contactKey: state.contactKey, actorId: req.user!.id, provenance: 'OPERATOR_RECORDED' },
      }, skipDuplicates: true });
      if (!logged.count) throw new ConflictError('This communication already has a manual delivery record.');
      await tx.pitch.update({ where: { id }, data: { status: 'SENT', sentAt } });
      await advanceLeadForPitch(tx, pitch, earlyStages, 'Contacted');
      return tx.pitch.findUniqueOrThrow({ where: { id }, include: { lead: true } });
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/pitches/:id - Delete an outreach record
router.delete('/:id', writeAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    if (isDatabaseConnected) {
      const result = await prisma.pitch.deleteMany({ where: { id, status: 'DRAFT', approvedAt: null } });
      if (!result.count) {
        if (!await prisma.pitch.findUnique({ where: { id } })) throw new NotFoundError('Outreach draft not found.');
        throw new ConflictError('Keep approved drafts and recorded communications in the conversation history.');
      }
      res.json({ success: true, message: 'Outreach draft deleted successfully.' });
      return;
    }

    const index = memoryStore.pitches.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new NotFoundError(`Outreach draft with ID ${id} not found.`);
    }
    memoryStore.pitches.splice(index, 1);
    res.json({ success: true, message: 'Outreach draft deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

export default router;
