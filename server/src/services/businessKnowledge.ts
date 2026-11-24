import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { isDatabaseConnected, memoryStore, prisma } from '../db/prisma';
import { ConflictError, NotFoundError } from '../utils/errors';
import { projectClaimsSchema, type BusinessProfileInput, type PortfolioProjectInput } from './businessKnowledgeTypes';

const workspaceProfile = 'workspace';
const staleEdit = 'Another edit was saved. Reload this page before trying again.';
const initialProfile: BusinessProfileInput = {
  displayName: 'Sravan Kumar Naredla',
  professionalRole: 'Freelance Full-Stack and Application Developer',
  portfolioUrl: 'https://sravan-kumar-portfolio-sepia.vercel.app/',
  services: [
    'Website development', 'E-commerce development', 'React development', 'React Native mobile applications',
    'Admin dashboard development', 'Backend API development', 'Node.js and Express development', 'Database integration',
    'AI applications', 'Gemini AI integrations', 'Website redesign and optimization',
  ],
  technologies: ['React', 'React Native', 'TypeScript', 'JavaScript', 'Tailwind CSS', 'Vite', 'Node.js', 'Express', 'PostgreSQL', 'Supabase', 'Expo', 'REST APIs'],
  defaultCurrency: 'INR',
};

const initialProjects: Array<PortfolioProjectInput & { id: string }> = [
  {
    id: 'fresh-vegetables-organic', name: 'Fresh Vegetables Organic', url: 'https://fresh-vegetables-organic.vercel.app/',
    serviceCategories: ['E-commerce development', 'Website development'], shareable: false,
    claims: [{ kind: 'feature', statement: 'The public site displays shopping, cart, and order-tracking entry points.',
      evidence: 'Observed on the rendered public page.', evidenceUrl: 'https://fresh-vegetables-organic.vercel.app/', approved: false }],
  },
  {
    id: 'sai-deveena-traders', name: 'Sai Deveena Traders', url: 'https://sai-deveena-traders.vercel.app/',
    serviceCategories: ['Website development', 'Business catalogue'], shareable: false,
    claims: [{ kind: 'description', statement: 'The site describes an agricultural and general store with phone and WhatsApp enquiries.',
      evidence: 'Public site metadata. The enquiry flows are awaiting verification.', evidenceUrl: 'https://sai-deveena-traders.vercel.app/', approved: false }],
  },
];

const previewProfile = { id: workspaceProfile, ...initialProfile, revision: 1, updatedAt: new Date() };
let memoryProfile = structuredClone(previewProfile);
const memoryProjects = initialProjects.map((project) => ({ ...structuredClone(project), revision: 1, updatedAt: new Date(), archivedAt: null as Date | null }));

async function initializeKnowledge() {
  if (await prisma.businessProfile.findUnique({ where: { id: workspaceProfile }, select: { id: true } })) return;
  await prisma.$transaction(async (tx) => {
    const profile = await tx.businessProfile.createMany({ data: [{ id: workspaceProfile, ...initialProfile }], skipDuplicates: true });
    if (profile.count) await tx.portfolioProject.createMany({ data: initialProjects, skipDuplicates: true });
  });
}

function addPreviewEvent(action: string, description: string, metadata?: Record<string, string>) {
  memoryStore.logs.unshift({ id: randomUUID(), action, description, metadata, createdAt: new Date() });
}

function checkRevision(current: number, received: number) {
  if (current !== received) throw new ConflictError(staleEdit);
}

export async function getBusinessKnowledge() {
  if (!isDatabaseConnected) return { profile: structuredClone(memoryProfile), projects: structuredClone(memoryProjects), storage: 'temporary' as const };
  await initializeKnowledge();
  const [profile, projects] = await Promise.all([
    prisma.businessProfile.findUniqueOrThrow({ where: { id: workspaceProfile } }),
    prisma.portfolioProject.findMany({ orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] }),
  ]);
  return { profile, projects: projects.map((project) => ({ ...project, claims: projectClaimsSchema.parse(project.claims) })), storage: 'database' as const };
}

export async function saveBusinessProfile(input: BusinessProfileInput, revision: number) {
  if (!isDatabaseConnected) {
    checkRevision(memoryProfile.revision, revision);
    memoryProfile = { ...memoryProfile, ...input, revision: revision + 1, updatedAt: new Date() };
    addPreviewEvent('BUSINESS_PROFILE_UPDATED', 'Updated the business profile.');
    return memoryProfile;
  }
  await initializeKnowledge();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.businessProfile.updateMany({
      where: { id: workspaceProfile, revision }, data: { ...input, revision: { increment: 1 } },
    });
    if (!updated.count) throw new ConflictError(staleEdit);
    await tx.activityLog.create({ data: { action: 'BUSINESS_PROFILE_UPDATED', description: 'Updated the business profile.' } });
    return tx.businessProfile.findUniqueOrThrow({ where: { id: workspaceProfile } });
  });
}

export async function createPortfolioProject(input: PortfolioProjectInput) {
  if (!isDatabaseConnected) {
    if (memoryProjects.some((project) => project.url === input.url)) throw new ConflictError('A project already uses that URL.');
    const project = { ...input, id: randomUUID(), revision: 1, updatedAt: new Date(), archivedAt: null };
    memoryProjects.push(project);
    addPreviewEvent('PORTFOLIO_PROJECT_CREATED', 'Added a portfolio project.', { projectId: project.id });
    return project;
  }
  await initializeKnowledge();
  try {
    return await prisma.$transaction(async (tx) => {
      const project = await tx.portfolioProject.create({ data: input });
      await tx.activityLog.create({ data: { action: 'PORTFOLIO_PROJECT_CREATED', description: 'Added a portfolio project.', metadata: { projectId: project.id } } });
      return project;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('A project already uses that URL.');
    throw error;
  }
}

type PortfolioChanges = PortfolioProjectInput | { archivedAt: Date | null };

export async function savePortfolioProject(id: string, changes: PortfolioChanges, revision: number) {
  const archiveChange = 'archivedAt' in changes;
  const action = archiveChange ? changes.archivedAt ? 'PORTFOLIO_PROJECT_ARCHIVED' : 'PORTFOLIO_PROJECT_RESTORED' : 'PORTFOLIO_PROJECT_UPDATED';
  if (!isDatabaseConnected) {
    const index = memoryProjects.findIndex((project) => project.id === id);
    if (index === -1) throw new NotFoundError('Portfolio project not found.');
    checkRevision(memoryProjects[index].revision, revision);
    if ('url' in changes && memoryProjects.some((project) => project.id !== id && project.url === changes.url)) {
      throw new ConflictError('A project already uses that URL.');
    }
    const project = { ...memoryProjects[index], ...changes, revision: revision + 1, updatedAt: new Date() };
    memoryProjects[index] = project;
    addPreviewEvent(action, 'Updated a portfolio project.', { projectId: id });
    return project;
  }
  await initializeKnowledge();
  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.portfolioProject.updateMany({ where: { id, revision }, data: { ...changes, revision: { increment: 1 } } });
      const current = await tx.portfolioProject.findUnique({ where: { id } });
      if (!current) throw new NotFoundError('Portfolio project not found.');
      if (!updated.count) checkRevision(current.revision, revision);
      await tx.activityLog.create({ data: { action, description: 'Updated a portfolio project.', metadata: { projectId: id } } });
      return current;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('A project already uses that URL.');
    throw error;
  }
}
