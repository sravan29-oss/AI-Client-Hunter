import { Router } from 'express';
import { z } from 'zod';
import { validateRequest } from '../middleware/validate';
import { createPortfolioProject, getBusinessKnowledge, saveBusinessProfile, savePortfolioProject } from '../services/businessKnowledge';
import { businessProfileSchema, portfolioProjectSchema, revisionSchema } from '../services/businessKnowledgeTypes';

const router = Router();
const projectId = z.object({ id: z.string().trim().min(1).max(100) });

router.get('/', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await getBusinessKnowledge() });
  } catch (error) { next(error); }
});

router.put('/', validateRequest({ body: businessProfileSchema.extend({ revision: revisionSchema }) }), async (req, res, next) => {
  try {
    const { revision, ...profile } = req.body;
    res.json({ success: true, data: await saveBusinessProfile(profile, revision) });
  } catch (error) { next(error); }
});

router.post('/projects', validateRequest({ body: portfolioProjectSchema }), async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await createPortfolioProject(req.body) });
  } catch (error) { next(error); }
});

router.put('/projects/:id', validateRequest({ params: projectId, body: portfolioProjectSchema.extend({ revision: revisionSchema }) }), async (req, res, next) => {
  try {
    const { revision, ...project } = req.body;
    res.json({ success: true, data: await savePortfolioProject(String(req.params.id), project, revision) });
  } catch (error) { next(error); }
});

router.patch('/projects/:id/archive', validateRequest({ params: projectId, body: z.object({ archived: z.boolean(), revision: revisionSchema }) }), async (req, res, next) => {
  try {
    const { archived, revision } = req.body;
    res.json({ success: true, data: await savePortfolioProject(String(req.params.id), { archivedAt: archived ? new Date() : null }, revision) });
  } catch (error) { next(error); }
});

export default router;
