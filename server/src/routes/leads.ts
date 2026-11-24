import type { Prisma } from '@prisma/client';
import { createOrFindLead, updateLeadWithIdentity } from '../db/leadIdentity';
import { CsvFormatError, escapeCsvCell, parseCsv } from '../utils/csv';
import { Router, Request, Response, NextFunction } from 'express';
import { recordLeadStage } from '../services/salesActivity';
import { z } from 'zod';
import { osmObjectSchema } from '../utils/osmObject';
import { prisma, isDatabaseConnected, memoryStore } from '../db/prisma';
import { validateRequest } from '../middleware/validate';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';

const router = Router();

import { extractDomain } from '../utils/domain';
export { extractDomain };

// Activity logging helper
async function logActivity(action: string, description: string, metadata?: any) {
  try {
    if (isDatabaseConnected) {
      await prisma.activityLog.create({
        data: { action, description, metadata },
      });
    } else {
      memoryStore.logs.unshift({
        id: 'act-' + Date.now(),
        action,
        description,
        metadata,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    logger.debug('Failed to log activity:', e);
  }
}

// Zod Schemas for request validation
const leadStatusEnum = z.enum([
  'New',
  'Qualified',
  'Reviewed',
  'Interested',
  'Not_Interested',
  'Rejected',
  'Archived',
  'Analysed',
  'Ready_to_Contact',
  'Contacted',
  'Replied',
  'Meeting_Scheduled',
  'Negotiation',
  'Won',
  'Lost',
]);

const websiteField = z.string().trim().refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value.includes('://') ? value : 'https://' + value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Invalid website URL');

const createLeadSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required (min 2 chars)'),
  website: websiteField.optional(),
  country: z.string().default('India'),
  city: z.string().optional().or(z.literal('')),
  industry: z.string().default('Technology'),
  businessEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  contactName: z.string().optional().or(z.literal('')),
  publicBusinessPhone: z.string().optional().or(z.literal('')),
  source: z.string().default('Manual'),
  discoveryDate: z.iso.datetime({ offset: true }).optional(),
  osmObject: osmObjectSchema.optional(),
  businessDescription: z.string().optional().or(z.literal('')),
  detectedProblems: z.array(z.string()).default([]),
  suggestedServices: z.array(z.string()).default([]),
  opportunityScore: z.number().int().min(0).max(100).default(70),
  leadStatus: leadStatusEnum.default('New'),
  notes: z.string().optional().or(z.literal('')),
  qualificationScore: z.number().int().min(0).max(100).optional(),
  qualificationReason: z.string().optional().or(z.literal('')),
  qualificationEvidence: z.string().optional().or(z.literal('')),
  suggestedProjectScope: z.string().optional().or(z.literal('')),
  estimatedComplexity: z.string().optional().or(z.literal('')),
  aiSummary: z.string().optional().or(z.literal('')),
});

const updateLeadSchema = z.object({
  ...createLeadSchema.omit({ osmObject: true, discoveryDate: true }).shape,
  country: z.string(),
  industry: z.string(),
  source: z.string(),
  detectedProblems: z.array(z.string()),
  suggestedServices: z.array(z.string()),
  opportunityScore: z.number().int().min(0).max(100),
  leadStatus: leadStatusEnum,
}).partial();

const queryParamsSchema = z.object({
  search: z.string().optional(),
  country: z.string().optional(),
  industry: z.string().optional(),
  service: z.string().optional(),
  status: z.string().optional(),
  sortBy: z.enum(['opportunityScore', 'createdAt', 'businessName']).default('opportunityScore'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// GET /api/leads - List and filter leads
router.get('/', validateRequest({ query: queryParamsSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, country, industry, service, status, sortBy, sortOrder } = req.query as any;

    if (isDatabaseConnected) {
      const where: any = {};

      if (country && country !== 'ALL') {
        where.country = { equals: country, mode: 'insensitive' };
      }
      if (industry && industry !== 'ALL') {
        where.industry = { equals: industry, mode: 'insensitive' };
      }
      if (status && status !== 'ALL') {
        // Map display string if has spaces
        const mappedStatus = status.replace(/\s+/g, '_');
        where.leadStatus = mappedStatus;
      }
      if (service && service !== 'ALL') {
        where.suggestedServices = { has: service };
      }
      if (search && search.trim()) {
        const q = search.trim();
        where.OR = [
          { businessName: { contains: q, mode: 'insensitive' } },
          { website: { contains: q, mode: 'insensitive' } },
          { contactName: { contains: q, mode: 'insensitive' } },
          { businessEmail: { contains: q, mode: 'insensitive' } },
          { industry: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
          { country: { contains: q, mode: 'insensitive' } },
        ];
      }

      const orderBy: any = {};
      orderBy[sortBy || 'opportunityScore'] = sortOrder || 'desc';

      const leads = await prisma.lead.findMany({
        where,
        orderBy,
        include: {
          audits: { take: 1, orderBy: { createdAt: 'desc' } },
          pitches: { take: 1, orderBy: { createdAt: 'desc' } },
          discoverySources: { take: 20, orderBy: { lastDiscoveredAt: 'desc' } },
        },
      });

      res.json({ success: true, count: leads.length, data: leads });
      return;
    }

    // In-memory fallback
    let filtered = [...memoryStore.leads];
    if (country && country !== 'ALL') filtered = filtered.filter((l) => l.country?.toLowerCase() === country.toLowerCase());
    if (industry && industry !== 'ALL') filtered = filtered.filter((l) => l.industry?.toLowerCase() === industry.toLowerCase());
    if (status && status !== 'ALL') filtered = filtered.filter((l) => l.leadStatus === status || l.leadStatus === status.replace(/\s+/g, '_'));
    if (service && service !== 'ALL') filtered = filtered.filter((l) => l.suggestedServices?.includes(service));

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.businessName?.toLowerCase().includes(q) ||
          l.website?.toLowerCase().includes(q) ||
          l.contactName?.toLowerCase().includes(q) ||
          l.businessEmail?.toLowerCase().includes(q) ||
          l.industry?.toLowerCase().includes(q) ||
          l.city?.toLowerCase().includes(q) ||
          l.country?.toLowerCase().includes(q)
      );
    }

    filtered.sort((a, b) => {
      if (sortBy === 'opportunityScore') {
        return sortOrder === 'asc' ? a.opportunityScore - b.opportunityScore : b.opportunityScore - a.opportunityScore;
      }
      return sortOrder === 'asc'
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    res.json({ success: true, count: filtered.length, data: filtered, isFallback: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/filters/options - Dynamic list of distinct filter values in the database
router.get('/filters/options', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let leads: any[] = [];
    if (isDatabaseConnected) {
      leads = await prisma.lead.findMany({
        select: { country: true, industry: true, suggestedServices: true, leadStatus: true },
      });
    } else {
      leads = memoryStore.leads;
    }

    const countries = Array.from(new Set(leads.map((l) => l.country).filter(Boolean))).sort();
    const industries = Array.from(new Set(leads.map((l) => l.industry).filter(Boolean))).sort();
    const services = Array.from(
      new Set(leads.flatMap((l) => l.suggestedServices || []).filter(Boolean))
    ).sort();
    const statuses = [
      'New',
      'Analysed',
      'Ready_to_Contact',
      'Contacted',
      'Replied',
      'Meeting_Scheduled',
      'Negotiation',
      'Won',
      'Lost',
    ];

    res.json({
      success: true,
      data: {
        countries,
        industries,
        services,
        statuses,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/export/csv - Export leads to CSV
router.get('/export/csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let leads: any[] = [];
    if (isDatabaseConnected) {
      leads = await prisma.lead.findMany({
        orderBy: [{ opportunityScore: 'desc' }, { createdAt: 'desc' }],
      });
    } else {
      leads = memoryStore.leads;
    }

    // Construct CSV
    const headers = [
      'ID',
      'Business Name',
      'Website',
      'Country',
      'City',
      'Industry',
      'Business Email',
      'Contact Name',
      'Phone',
      'Source',
      'Opportunity Score',
      'Lead Status',
      'Suggested Services',
      'Detected Problems',
      'Notes',
      'Created At',
    ];

    const rows = leads.map((l) => [
      escapeCsvCell(l.id),
      escapeCsvCell(l.businessName),
      escapeCsvCell(l.website),
      escapeCsvCell(l.country),
      escapeCsvCell(l.city),
      escapeCsvCell(l.industry),
      escapeCsvCell(l.businessEmail),
      escapeCsvCell(l.contactName),
      escapeCsvCell(l.publicBusinessPhone),
      escapeCsvCell(l.source),
      escapeCsvCell(l.opportunityScore),
      escapeCsvCell(l.leadStatus),
      escapeCsvCell(l.suggestedServices),
      escapeCsvCell(l.detectedProblems),
      escapeCsvCell(l.notes),
      escapeCsvCell(l.createdAt),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="AI_Client_Hunter_Leads_${new Date().toISOString().split('T')[0]}.csv"`
    );
    res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
});

function mapLeadRow(value: unknown, csv: boolean) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  const field = (...aliases: string[]) => {
    for (const name of aliases) {
      const candidate = Object.hasOwn(raw, name) ? raw[name] : undefined;
      if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
    }
    return undefined;
  };
  const list = (entry: unknown) => typeof entry === 'string' ? entry.split(/[;,]/).map((item) => item.trim()).filter(Boolean) : entry;
  const score = field('opportunityScore', 'Opportunity Score');
  const status = field('leadStatus', 'Lead Status', 'status');
  return {
    businessName: field('businessName', 'Business Name', 'business_name', 'company', 'companyName'),
    website: field('website', 'Website', 'url', 'websiteUrl'),
    country: field('country', 'Country') ?? (csv || raw.region === 'INDIA' ? 'India' : 'United States'),
    city: field('city', 'City'),
    industry: field('industry', 'Industry'),
    businessEmail: field('businessEmail', 'Business Email', 'email'),
    contactName: field('contactName', 'Contact Name'),
    publicBusinessPhone: field('publicBusinessPhone', 'Phone', 'phone', 'contactPhone'),
    source: field('source', 'Source') ?? (csv ? 'CSV Import' : 'AI Prospector'),
    discoveryDate: csv ? undefined : field('discoveryDate'),
    osmObject: csv ? undefined : field('osmObject'),
    notes: field('notes', 'Notes'),
    businessDescription: field('businessDescription', 'Description', 'description'),
    opportunityScore: typeof score === 'string' ? Number(score) : score ?? (csv ? 70 : 75),
    suggestedServices: list(field('suggestedServices', 'Suggested Services', 'services')) ?? (csv ? [] : ['Business website']),
    detectedProblems: list(field('detectedProblems', 'Detected Problems', 'problems')),
    leadStatus: csv && typeof status === 'string' ? status.trim().replace(/\s+/g, '_') : undefined,
  };
}

function validateBulkRows(records: Array<{ row: number; value: unknown }>, csv: boolean) {
  if (!records.length || records.length > 2000) throw new BadRequestError('Provide between 1 and 2,000 lead rows.');
  const valid: Array<{ row: number; data: z.infer<typeof createLeadSchema> }> = [];
  const errors: Array<{ row: number; field?: string; error: string }> = [];
  for (const { row, value } of records) {
    const result = createLeadSchema.safeParse(mapLeadRow(value, csv));
    if (result.success) valid.push({ row, data: result.data });
    else for (const issue of result.error.issues) {
      errors.push({ row, field: issue.path.join('.') || undefined, error: issue.message });
    }
  }
  return { valid, errors };
}

router.post('/import/csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows, csvText } = req.body ?? {};
    const records = typeof csvText === 'string'
      ? parseCsv(csvText)
      : Array.isArray(rows) ? rows.map((value, index) => ({ row: index + 1, value })) : [];
    const { valid, errors } = validateBulkRows(records, true);
    const imported = [];
    const skippedDuplicates = [];
    for (const { row, data } of valid) {
      const { lead, created } = await createOrFindLead(data);
      if (created) imported.push(lead);
      else skippedDuplicates.push({
        row, businessName: data.businessName, website: data.website,
        reason: 'An existing lead owns this business identity.', existingId: lead.id,
      });
    }
    if (imported.length) await logActivity('CSV_IMPORT', `Imported ${imported.length} leads from CSV.`);
    res.status(201).json({
      success: true, importedCount: imported.length, skippedCount: skippedDuplicates.length,
      errorCount: new Set(errors.map(({ row }) => row)).size, imported, skippedDuplicates, errors,
    });
  } catch (error) {
    if (error instanceof CsvFormatError) {
      return next(new BadRequestError('Invalid CSV format.', [{ row: error.row, error: error.message }]));
    }
    next(error);
  }
});

router.post('/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = req.body?.leads;
    const { valid, errors } = validateBulkRows(Array.isArray(rows) ? rows.map((value, index) => ({ row: index + 1, value })) : [], false);
    const created = [];
    for (const { data } of valid) {
      const result = await createOrFindLead(data);
      if (result.created) created.push(result.lead);
    }
    if (created.length) await logActivity('BATCH_LEADS_CREATED', `Added ${created.length} leads from discovery.`);
    res.status(201).json({ success: true, count: created.length, data: created, errors });
  } catch (error) {
    next(error);
  }
});

// GET /api/leads/:id - Get individual lead details
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    if (isDatabaseConnected) {
      const lead = await prisma.lead.findUnique({
        where: { id },
        include: {
          audits: { orderBy: { createdAt: 'desc' } },
          pitches: { orderBy: { createdAt: 'desc' } },
          discoverySources: { take: 50, orderBy: { lastDiscoveredAt: 'desc' } },
          providerVerifications: { where: { provider: 'gemini', status: 'verified' }, take: 1,
            orderBy: { finishedAt: 'desc' }, select: { finishedAt: true, evidence: true, origin: true } },
          geminiRankingJobs: { take: 1, orderBy: { createdAt: 'desc' }, select: { status: true, lastStatus: true } },
        },
      });

      if (!lead) throw new NotFoundError(`Lead with ID "${id}" does not exist.`);
      const activityHistory = await prisma.activityLog.findMany({
        where: { metadata: { path: ['leadId'], equals: id } },
        take: 30, orderBy: { createdAt: 'desc' }, select: { id: true, description: true, createdAt: true },
      });
      const { geminiRankingJobs, ...detail } = lead;
      const job = geminiRankingJobs[0];
      const aiStatus = job?.status === 'COMPLETED' ? 'available'
        : job?.status === 'FAILED' ? 'failed'
        : job?.status === 'RETRYING' || (job && job.lastStatus !== null) ? 'temporarily_unavailable'
        : job ? 'pending'
        : detail.providerVerifications.length || (detail.discoveryEvidence as { analysis?: { generatedBy?: string } } | null)?.analysis?.generatedBy === 'gemini' ? 'available' : null;
      res.json({ success: true, data: { ...detail, aiStatus, activityHistory } });
      return;
    }

    const lead = memoryStore.leads.find((l) => l.id === id);
    if (!lead) throw new NotFoundError(`Lead with ID "${id}" does not exist.`);

    res.json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads - Create a lead or return its canonical record.
router.post('/', validateRequest({ body: createLeadSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lead, created } = await createOrFindLead(req.body);
    if (created) await logActivity('LEAD_CREATED', 'Added a lead.', { leadId: lead.id });
    res.status(created ? 201 : 200).json({ success: true, duplicate: !created, data: lead });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', validateRequest({ body: updateLeadSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { existing, updated } = await updateLeadWithIdentity(id, req.body, async (tx, before, after) => {
      if (before.leadStatus !== after.leadStatus) {
        await recordLeadStage(tx, id, before.leadStatus, after.leadStatus);
      } else {
        await tx.activityLog.create({ data: {
          action: 'LEAD_UPDATED', description: 'Updated lead details.', metadata: { leadId: id },
        } });
      }
    });
    if (!isDatabaseConnected && existing.leadStatus !== updated.leadStatus) {
      await logActivity('STATUS_CHANGED', 'Updated lead stage.', { leadId: id, from: existing.leadStatus, to: updated.leadStatus });
    } else if (!isDatabaseConnected) {
      await logActivity('LEAD_UPDATED', 'Updated lead details.', { leadId: id });
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/leads/:id - Delete lead with confirmation logging
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    if (isDatabaseConnected) {
      const existing = await prisma.lead.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError(`Lead with ID "${id}" not found.`);

      await prisma.lead.delete({ where: { id } });

      await logActivity('LEAD_DELETED', `Permanently deleted lead "${existing.businessName}"`, {
        leadId: id,
        businessName: existing.businessName,
      });

      res.json({ success: true, message: `Lead "${existing.businessName}" deleted successfully.` });
      return;
    }

    const index = memoryStore.leads.findIndex((l) => l.id === id);
    if (index === -1) throw new NotFoundError(`Lead with ID "${id}" not found.`);

    const deleted = memoryStore.leads.splice(index, 1)[0];
    await logActivity('LEAD_DELETED', `Permanently deleted lead "${deleted.businessName}"`, { leadId: id });

    res.json({ success: true, message: `Lead "${deleted.businessName}" deleted successfully.` });
  } catch (err) {
    next(err);
  }
});

export default router;
