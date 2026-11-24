import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { businessReportRequest } from '../services/businessReportCalendar';
import { businessReportCsv, generateBusinessReport, listBusinessReports, loadBusinessReport } from '../services/businessReports';
import { reportGeminiAvailable, requestReportInterpretation } from '../services/businessReportAi';

const router = Router();
const operator = requireRole(['admin', 'developer']);
const reportId = z.uuid();

router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/', async (req, res, next) => {
  try {
    const after = reportId.optional().parse(req.query.after);
    const history = await listBusinessReports(after);
    res.json({ success: true, data: { ...history, geminiAvailable: reportGeminiAvailable() } });
  } catch (err) { next(err); }
});

router.post('/', operator, async (req, res, next) => {
  try {
    const report = await generateBusinessReport(businessReportRequest.parse(req.body));
    res.status(201).json({ success: true, data: report });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const report = await loadBusinessReport(reportId.parse(req.params.id));
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});

router.get('/:id/export.csv', async (req, res, next) => {
  try {
    const report = await loadBusinessReport(reportId.parse(req.params.id));
    res.type('text/csv').attachment(`${report.kind}-business-report-${report.periodFrom}.csv`).send('\uFEFF' + businessReportCsv(report));
  } catch (err) { next(err); }
});

router.post('/:id/insights', operator, async (req, res, next) => {
  try {
    const result = await requestReportInterpretation(reportId.parse(req.params.id));
    res.status(result.status === 'generated' ? 201 : 200).json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
