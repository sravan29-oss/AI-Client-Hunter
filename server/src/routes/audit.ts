import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { scraperService } from '../services/scraper';
import { geminiService } from '../services/gemini';
import { prisma, isDatabaseConnected, memoryStore } from '../db/prisma';
import { validateRequest } from '../middleware/validate';
import { NotFoundError } from '../utils/errors';

const router = Router();

const auditSchema = z.object({
  websiteUrl: z.string().min(3, 'Valid website URL or domain is required'),
  companyName: z.string().optional(),
  leadId: z.string().optional(),
  targetServices: z.array(z.string()).optional(),
});

// GET /api/audit - List recent website audits
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (isDatabaseConnected) {
      const audits = await prisma.auditReport.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          lead: { select: { id: true, businessName: true, country: true } },
        },
      });
      res.json({ success: true, count: audits.length, data: audits });
      return;
    }

    res.json({ success: true, count: memoryStore.audits.length, data: memoryStore.audits });
  } catch (err) {
    next(err);
  }
});

// GET /api/audit/:id - Get specific audit report by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    if (isDatabaseConnected) {
      const audit = await prisma.auditReport.findUnique({
        where: { id },
        include: {
          lead: { select: { id: true, businessName: true, country: true } },
        },
      });
      if (!audit) throw new NotFoundError(`Audit report with ID "${id}" does not exist.`);
      res.json({ success: true, data: audit });
      return;
    }

    const audit = memoryStore.audits.find((a) => a.id === id);
    if (!audit) throw new NotFoundError(`Audit report with ID "${id}" does not exist.`);
    res.json({ success: true, data: audit });
  } catch (err) {
    next(err);
  }
});

// POST /api/audit - Scrapes website & generates deep tech audit with Gemini
router.post('/', validateRequest({ body: auditSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { websiteUrl, companyName, leadId, targetServices }: z.infer<typeof auditSchema> = req.body;
    const memoryLead = leadId && !isDatabaseConnected
      ? memoryStore.leads.find((lead) => lead.id === leadId)
      : undefined;
    if (leadId) {
      const lead = isDatabaseConnected
        ? await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } })
        : memoryLead;
      if (!lead) throw new NotFoundError('The selected lead no longer exists.');
    }

    // 1. Safely scrape real webpage telemetry with SSRF protection
    const evidence = await scraperService.scrapeUrl(websiteUrl);

    // 2. Synthesize with Gemini based on empirical evidence
    const aiAudit = await geminiService.auditWebsite({
      websiteUrl: evidence.url,
      companyName: companyName || evidence.pageTitle,
      evidence,
      targetServices,
    });

    const auditData = {
      leadId: leadId || null,
      websiteUrl: evidence.url,
      overallScore: aiAudit.overallScore ?? 70,
      mobileFriendly: aiAudit.mobileFriendly ?? evidence.hasViewport,
      speedScore: aiAudit.speedScore ?? 75,
      techStackDetected: aiAudit.techStackDetected || evidence.detectedTech,
      missingCapabilities: aiAudit.missingCapabilities || [],
      securityFindings: aiAudit.securityFindings || [],
      uiUxIssues: aiAudit.uiUxIssues || [],
      pitchHooks: aiAudit.pitchHooks || [],
      summary: aiAudit.websiteSummary || aiAudit.summary || '',
      rawData: {
        evidence,
        analysis: aiAudit,
        loadTimeMs: evidence.loadTimeMs,
        htmlSizeKb: evidence.htmlSizeKb,
      } as any,
    };
    const findings = auditData.uiUxIssues.slice(0, 3);

    // 3. Save report to PostgreSQL or Memory
    if (isDatabaseConnected) {
      const savedReport = await prisma.$transaction(async (tx) => {
        if (leadId) {
          await tx.lead.updateMany({
            where: { id: leadId, leadStatus: 'New' },
            data: { leadStatus: 'Analysed' },
          });
          if (findings.length > 0) {
            await tx.lead.update({
              where: { id: leadId },
              data: { detectedProblems: { push: findings } },
            });
          }
        }
        const report = await tx.auditReport.create({ data: auditData });
        await tx.activityLog.create({
          data: {
            action: 'WEBSITE_AUDIT',
            description: `Completed comprehensive technical audit for "${evidence.url}" (Score: ${report.overallScore}%)`,
            metadata: {
              url: evidence.url,
              overallScore: report.overallScore,
              speedScore: report.speedScore,
            },
          },
        });
        return report;
      });

      res.status(201).json({
        success: true,
        data: {
          ...savedReport,
          evidence,
          analysis: aiAudit,
        },
        generatedBy: aiAudit.generatedBy,
        model: aiAudit.model,
        isFallback: aiAudit.isFallback,
      });
      return;
    }

    // In-memory fallback
    const fallbackReport = {
      id: 'audit-' + Date.now(),
      ...auditData,
      createdAt: new Date().toISOString(),
    };
    memoryStore.audits.unshift(fallbackReport);

    if (memoryLead) {
      if (memoryLead.leadStatus === 'New') memoryLead.leadStatus = 'Analysed';
      memoryLead.detectedProblems = Array.from(new Set([...(memoryLead.detectedProblems || []), ...findings]));
      memoryLead.updatedAt = fallbackReport.createdAt;
      if (!memoryLead.audits) memoryLead.audits = [];
      memoryLead.audits.unshift(fallbackReport);
    }

    res.status(201).json({
      success: true,
      data: {
        ...fallbackReport,
        evidence,
        analysis: aiAudit,
      },
      generatedBy: aiAudit.generatedBy,
      model: aiAudit.model,
      isFallback: aiAudit.isFallback,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/audit/lead/:leadId - Get audit reports for a specific lead
router.get('/lead/:leadId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leadId = String(req.params.leadId);

    if (isDatabaseConnected) {
      const reports = await prisma.auditReport.findMany({
        where: { leadId },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: reports });
      return;
    }

    const reports = memoryStore.audits.filter((a) => a.leadId === leadId);
    res.json({ success: true, data: reports });
  } catch (err) {
    next(err);
  }
});

export default router;
