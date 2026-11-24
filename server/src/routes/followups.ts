import { Router } from 'express';
import { z } from 'zod';
import { isDatabaseConnected, prisma } from '../db/prisma';
import { requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../utils/errors';

const router = Router();
const recordId = z.string().trim().min(1).max(120);
const title = z.string().trim().min(1).max(160);
const notes = z.string().trim().max(3000).nullable();
const dueAt = z.iso.datetime({ offset: true }).transform((value) => new Date(value)).refine(
  (date) => Number.isFinite(date.getTime()) && date > new Date(),
  'Select a future date and time.',
);
const createSchema = z.object({
  leadId: recordId, pitchId: recordId.optional(), title, notes: notes.optional(), dueAt,
}).strict();
const updateSchema = z.object({
  revision: z.number().int().nonnegative(),
  title: title.optional(), notes: notes.optional(), dueAt: dueAt.optional(),
  status: z.enum(['COMPLETED', 'CANCELLED']).optional(),
}).strict().refine(
  ({ status, ...changes }) => status ? Object.keys(changes).length === 1 : Object.keys(changes).length > 1,
  'Update reminder details or record its outcome.',
);
const querySchema = z.object({ leadId: recordId.optional(), status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional() }).strict();
const leadSummary = { lead: { select: { id: true, businessName: true } } } as const;
const writeAccess = requireRole(['admin', 'developer']);

router.use((_req, _res, next) => {
  next(isDatabaseConnected ? undefined : new AppError('Follow-up scheduling requires PostgreSQL.', 503));
});

router.get('/', async (req, res, next) => {
  try {
    const where = querySchema.parse(req.query);
    const data = await prisma.leadFollowUp.findMany({ where, include: leadSummary, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }] });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/', writeAccess, validateRequest({ body: createSchema }), async (req, res, next) => {
  try {
    const input: z.output<typeof createSchema> = req.body;
    const data = await prisma.$transaction(async (tx) => {
      if (!await tx.lead.findUnique({ where: { id: input.leadId }, select: { id: true } })) throw new NotFoundError('Lead not found.');
      if (input.pitchId && !await tx.pitch.findFirst({ where: { id: input.pitchId, leadId: input.leadId }, select: { id: true } })) {
        throw new BadRequestError('The selected draft must belong to this lead.');
      }
      const followUp = await tx.leadFollowUp.create({ data: input, include: leadSummary });
      await tx.activityLog.create({ data: {
        action: 'FOLLOW_UP_SCHEDULED', description: 'Scheduled a follow-up.',
        metadata: { leadId: followUp.leadId, followUpId: followUp.id, pitchId: followUp.pitchId, dueAt: followUp.dueAt.toISOString() },
      } });
      return followUp;
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', writeAccess, validateRequest({ body: updateSchema }), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { revision, ...changes }: z.output<typeof updateSchema> = req.body;
    const data = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "LeadFollowUp" WHERE "id" = ${id} FOR UPDATE`;
      const previous = await tx.leadFollowUp.findUnique({ where: { id } });
      if (!previous) throw new NotFoundError('Follow-up not found.');
      if (previous.status !== 'PENDING' || previous.revision !== revision) {
        throw new ConflictError('This follow-up changed. Reload it before continuing.');
      }
      const rescheduled = Boolean(changes.dueAt);
      const followUp = await tx.leadFollowUp.update({
        where: { id }, include: leadSummary,
        data: { ...changes, revision: { increment: 1 }, ...(rescheduled ? { remindedAt: null } : {}) },
      });
      if (previous.remindedAt && (rescheduled || changes.status)) {
        await tx.notification.updateMany({ where: {
          type: 'FOLLOW_UP_DUE',
          metadata: { path: ['followUpId'], equals: id },
          read: false,
        }, data: { read: true } });
      }
      await tx.activityLog.create({ data: {
        action: changes.status ? `FOLLOW_UP_${changes.status}` : rescheduled ? 'FOLLOW_UP_RESCHEDULED' : 'FOLLOW_UP_UPDATED',
        description: changes.status ? `Marked a follow-up ${changes.status.toLowerCase()}.` : 'Updated a scheduled follow-up.',
        metadata: { leadId: followUp.leadId, followUpId: id, dueAt: followUp.dueAt.toISOString() },
      } });
      return followUp;
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
