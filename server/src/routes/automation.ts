import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { schedulerService } from '../services/schedulerService';
import { dailyReportService } from '../services/dailyReportService';
import { validateRequest } from '../middleware/validate';
import { ConflictError } from '../utils/errors';
import { isValidTimeZone } from '../services/discovery/discoverySchedule';

const router = Router();

// Validation schema for updating automation configuration
const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  scheduleMode: z.enum(['DAILY', 'WEEKLY', 'MANUAL']).optional(),
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Scheduled time must be in HH:mm 24-hour format').optional(),
  timezone: z.string().trim().refine(isValidTimeZone, 'Choose a valid IANA time zone.').optional(),
  targetCountries: z.array(z.string().trim().min(1).max(120)).min(1).max(50).optional(),
  targetCities: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
  targetIndustries: z.array(z.string().trim().min(1).max(120)).min(1).max(50).optional(),
  minOpportunityScore: z.number().int().min(0).max(100).optional(),
  maxLeadsPerRun: z.number().int().min(1).max(50).optional(),
  preferredProvider: z.enum(['overpass', 'openstreetmap', 'google_places', 'serpapi']).optional(),
  notifyInApp: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  notifyTelegram: z.boolean().optional(),
  notificationEmail: z.string().email().optional().or(z.literal('')),
  telegramChatId: z.string().optional().or(z.literal('')),
});

/**
 * GET /api/automation/status
 * Get current running state, configuration overview, and timestamps.
 */
router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await schedulerService.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/automation/config
 * Get detailed scheduler configuration.
 */
router.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await schedulerService.getConfig();
    res.json({
      success: true,
      data: config,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/automation/config
 * Update scheduler configuration.
 */
router.put(
  '/config',
  validateRequest({ body: updateConfigSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await schedulerService.updateConfig(req.body);
      res.json({
        success: true,
        message: 'Automation configuration saved successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/automation/run
 * Trigger an immediate autonomous discovery cycle.
 */
const runRequestSchema = z.object({ locationKey: z.string().min(1).max(240).optional() });
router.post('/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { locationKey } = runRequestSchema.parse(req.body ?? {});
    const id = await schedulerService.queueManualRun(locationKey);
    if (!id) throw new ConflictError('A discovery job is already queued or running.');
    res.status(202).json({
      success: true,
      message: 'Discovery job accepted.',
      data: { id },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/automation/stop
 * Request a safe stop/pause of the currently running cycle.
 */
router.post('/stop', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stopped = await schedulerService.requestStop();
    res.json({
      success: true,
      message: stopped ? 'Stop requested.' : 'No discovery job is queued or running.',
      stopped,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/automation/logs
 * Retrieve execution history and error logs.
 */
router.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string, 10) || 30, 100));
    const logs = await schedulerService.getExecutionLogs(limit);
    res.json({
      success: true,
      data: logs,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/automation/reports
 * List historical daily reports.
 */
router.get('/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string, 10) || 30, 90));
    const reports = await dailyReportService.getDailyReports(limit);
    res.json({
      success: true,
      data: reports,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/automation/reports/generate
 * Trigger generation/refresh of today's daily report.
 */
router.post('/reports/generate', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await dailyReportService.generateDailyReport(new Date());
    res.json({
      success: true,
      message: 'Daily report refreshed successfully.',
      data: report,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/automation/reports/:id/export
 * Export a daily report as CSV.
 */
router.get('/reports/:id/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { filename, csv } = await dailyReportService.exportDailyReportCsv(id);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

export default router;
