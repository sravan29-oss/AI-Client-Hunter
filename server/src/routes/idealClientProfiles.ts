import { Router } from 'express';
import { z } from 'zod';
import { validateRequest } from '../middleware/validate';
import { createIdealProfile, duplicateIdealProfile, listIdealProfiles, saveIdealProfile, setActiveIdealProfile } from '../services/idealClientProfiles';
import { idealProfileSchema } from '../services/idealProfileTypes';
import { revisionSchema } from '../services/businessKnowledgeTypes';

const router = Router();
const params = z.object({ id: z.uuid() });

router.get('/', async (_req, res, next) => {
  try { res.json({ success: true, data: await listIdealProfiles() }); } catch (error) { next(error); }
});

router.post('/', validateRequest({ body: idealProfileSchema }), async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await createIdealProfile(req.body) }); } catch (error) { next(error); }
});

router.put('/:id', validateRequest({ params, body: idealProfileSchema.extend({ revision: revisionSchema }) }), async (req, res, next) => {
  try {
    const { revision, ...profile } = req.body;
    res.json({ success: true, data: await saveIdealProfile(String(req.params.id), revision, profile) });
  } catch (error) { next(error); }
});

router.post('/:id/duplicate', validateRequest({ params, body: z.object({ name: idealProfileSchema.shape.name, revision: revisionSchema }) }), async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await duplicateIdealProfile(String(req.params.id), req.body.revision, req.body.name) }); }
  catch (error) { next(error); }
});

router.patch('/:id/activation', validateRequest({ params, body: z.object({ active: z.boolean(), revision: revisionSchema }) }), async (req, res, next) => {
  try { res.json({ success: true, data: await setActiveIdealProfile(String(req.params.id), req.body.revision, req.body.active) }); }
  catch (error) { next(error); }
});

export default router;
