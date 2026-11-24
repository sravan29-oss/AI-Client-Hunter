import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, isDatabaseConnected, memoryStore } from '../db/prisma';
import { validateRequest } from '../middleware/validate';
import { AppError, BadRequestError, NotFoundError } from '../utils/errors';
import { requireRole } from '../middleware/auth';
import { getBusinessKnowledge } from '../services/businessKnowledge';

const router = Router();

const serviceSelection = z.object({
  serviceKey: z.string().min(1).max(100),
  tier: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']),
}).strict();

const estimateSchema = z.object({
  region: z.enum(['INDIA', 'US', 'UK', 'EUROPE', 'OTHER']),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
  services: z
    .array(serviceSelection)
    .min(1, 'Select at least one service'),
  addons: z
    .array(
      z.object({
        key: z.string(),
        name: z.string(),
        priceInr: z.number().finite().nonnegative(),
        priceUsd: z.number().finite().nonnegative(),
      })
    )
    .optional(),
  clientName: z.string().optional(),
});

const proposalSchema = z.object({
  leadId: z.string().min(1).max(120),
  currency: z.enum(['INR', 'USD']),
  services: z.array(serviceSelection).min(1).max(20),
}).strict().refine(
  ({ services }) => new Set(services.map((service) => service.serviceKey)).size === services.length,
  { message: 'Select one tier per service.', path: ['services'] },
);

async function getCatalog() {
  if (isDatabaseConnected) {
    const packages = await prisma.servicePackage.findMany({
      orderBy: [{ serviceKey: 'asc' }, { priceUsd: 'asc' }],
    });
    if (packages.length > 0) return packages;
  }
  return memoryStore.servicePackages;
}

function selectServiceItems(catalog: Awaited<ReturnType<typeof getCatalog>>, services: z.infer<typeof serviceSelection>[]) {
  return services.map(({ serviceKey, tier }) => {
    const pkg = catalog.find((item) => item.serviceKey === serviceKey && item.tier === tier);
    if (!pkg) throw new BadRequestError(`Unknown service package: ${serviceKey} (${tier}).`);
    const { id, name, priceInr, priceUsd, turnaroundWeeks, deliverables } = pkg;
    return { type: 'SERVICE' as const, id, serviceKey, tier, name, priceInr, priceUsd, turnaroundWeeks, deliverables };
  });
}

router.post('/proposals', requireRole(['admin', 'developer']), validateRequest({ body: proposalSchema }), async (req, res, next) => {
  try {
    if (!isDatabaseConnected) throw new AppError('Saving proposals requires PostgreSQL.', 503);
    const { leadId, currency, services }: z.infer<typeof proposalSchema> = req.body;
    const { profile } = await getBusinessKnowledge();
    const lines = selectServiceItems(await getCatalog(), services).map((item) => ({
      packageId: item.id, serviceKey: item.serviceKey, tier: item.tier, name: item.name,
      amountMinor: Math.round((currency === 'INR' ? item.priceInr : item.priceUsd) * 100),
      turnaroundWeeks: item.turnaroundWeeks, deliverables: item.deliverables as string[],
    }));
    if (lines.some((line) => !Number.isSafeInteger(line.amountMinor) || line.amountMinor < 0 || line.turnaroundWeeks < 1)) {
      throw new AppError('The selected catalog contains invalid proposal pricing or timelines.', 409);
    }
    const totalMinor = lines.reduce((total, line) => total + line.amountMinor, 0);
    if (!Number.isSafeInteger(totalMinor)) throw new BadRequestError('The proposal total exceeds the supported range.');
    const estimatedWeeks = Math.max(...lines.map((line) => line.turnaroundWeeks));
    const format = (minor: number) => new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency', currency,
    }).format(minor / 100);
    const data = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: leadId }, select: {
        id: true, businessName: true, city: true, country: true, website: true,
      } });
      if (!lead) throw new NotFoundError('Lead not found.');
      const subject = `Service proposal for ${lead.businessName}`;
      const location = [lead.city, lead.country].filter(Boolean).join(', ');
      const body = [
        subject,
        [`Prepared for ${lead.businessName}`, location, lead.website].filter(Boolean).join('\n'),
        `Prepared by ${profile.displayName}, ${profile.professionalRole}`,
        'Scope and deliverables',
        ...lines.map((line) => [
          `${line.name} (${line.tier}) — ${format(line.amountMinor)}`,
          ...line.deliverables.map((deliverable) => `• ${deliverable}`),
        ].join('\n')),
        `Estimated investment — ${format(totalMinor)}`,
        `Estimated delivery — ${estimatedWeeks}–${estimatedWeeks + 1} weeks from scope approval and receipt of required materials. Confirm sequencing, payment terms and applicable taxes before signing.`,
      ].join('\n\n');
      const pitch = await tx.pitch.create({
        data: {
          leadId, channel: 'UPWORK_PROPOSAL', messageType: 'SERVICE_PROPOSAL',
          subject, body, targetService: lines.map((line) => line.name).join(', '),
          targetRegion: lead.country?.toLowerCase() === 'india' ? 'INDIA' : 'OTHER',
          proposal: { currency, totalMinor, estimatedWeeks, lines, customer: lead },
          metadata: { generatedBy: 'SERVICE_CATALOG', profileRevision: profile.revision },
        },
        include: { lead: true },
      });
      await tx.activityLog.create({ data: {
        action: 'PROPOSAL_DRAFTED', description: 'Created a catalog-priced proposal draft.',
        metadata: { leadId, pitchId: pitch.id },
      } });
      return pitch;
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/ratecards - Get service packages catalog
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const packages = await getCatalog();
    res.json({ success: true, count: packages.length, data: packages });
  } catch (err) {
    next(err);
  }
});

// POST /api/ratecards/estimate - Calculate dynamic proposal price and timeline
router.post('/estimate', validateRequest({ body: estimateSchema }), async (req, res, next) => {
  try {
    const { region, currency: requestedCurrency, services, addons = [], clientName }: z.infer<typeof estimateSchema> = req.body;
    const serviceItems = selectServiceItems(await getCatalog(), services).map(({ id: _id, ...item }) => item);
    const lineItems = [
      ...serviceItems,
      ...addons.map(({ name, priceInr, priceUsd }) => ({ type: 'ADDON' as const, name, priceInr, priceUsd })),
    ];
    const totalInr = lineItems.reduce((total, item) => total + item.priceInr, 0);
    const totalUsd = lineItems.reduce((total, item) => total + item.priceUsd, 0);
    const maxTurnaroundWeeks = Math.max(...serviceItems.map((item) => item.turnaroundWeeks));
    const currency = region === 'INDIA' ? 'INR' : requestedCurrency ?? 'USD';
    const amounts = { INR: totalInr, USD: totalUsd, EUR: Math.round(totalUsd * 0.92), GBP: Math.round(totalUsd * 0.79) };
    const finalAmount = amounts[currency];
    const formattedAmount = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(finalAmount);

    const proposalSummary = `
PROPOSAL ESTIMATE ${clientName ? `FOR ${clientName.toUpperCase()}` : ''}
Region: ${region}
Estimated Investment: ${formattedAmount}
Estimated Timeline: ${maxTurnaroundWeeks} to ${maxTurnaroundWeeks + 1} weeks
Scope Included:
${lineItems.map((li) => `• ${li.name} (${li.type === 'SERVICE' ? `${li.tier} tier` : 'Add-on'})`).join('\n')}
`.trim();

    res.json({
      success: true,
      data: {
        region,
        currency,
        totalAmount: finalAmount,
        totalInr,
        totalUsd,
        estimatedWeeks: maxTurnaroundWeeks,
        lineItems,
        proposalSummary,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
