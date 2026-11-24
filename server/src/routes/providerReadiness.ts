import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { getReadiness, providers, verifyReadiness } from '../services/providerReadiness';
import { BadRequestError } from '../utils/errors';

const router = Router();
const choice = z.strictObject({ locationKey: z.string().min(1).max(240).optional(), leadId: z.uuid().optional(), requestId: z.uuid().optional() });
router.use(requireRole(['admin', 'developer']), (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.get('/', async (_req, res, next) => {
  try { res.json({ success: true, data: await getReadiness() }); } catch (error) { next(error); }
});
router.post('/:provider/verify', async (req, res, next) => {
  try {
    const id = z.enum(providers).safeParse(req.params.provider);
    const body = choice.safeParse(req.body ?? {});
    if (!id.success || !body.success || ((body.data.leadId || body.data.requestId) && id.data !== 'gemini') ||
      (body.data.locationKey && id.data !== 'overpass')) throw new BadRequestError('Invalid provider verification request.');
    res.json({ success: true, data: await verifyReadiness(id.data, body.data) });
  } catch (error) { next(error); }
});
export default router;
