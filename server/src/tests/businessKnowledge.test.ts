import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPortfolioProject, getBusinessKnowledge, saveBusinessProfile, savePortfolioProject } from '../services/businessKnowledge';
import { businessProfileSchema, portfolioProjectSchema } from '../services/businessKnowledgeTypes';
import { geminiService } from '../services/gemini';
import { generateProfileOutreach } from '../services/profileOutreach';
import { ConflictError } from '../utils/errors';

const profileName = 'Sravan Kumar Naredla';
const sampleProject = {
  name: 'Approved project fixture', url: 'https://project.example/', serviceCategories: ['E-commerce development'], shareable: true,
  claims: [
    { kind: 'feature' as const, statement: 'The demo shows a product catalogue.', evidence: 'Reviewed owner demo.', approved: true },
    { kind: 'feature' as const, statement: 'Unverified payment processing claim.', evidence: 'Awaiting a demonstration.', approved: false },
  ],
};

test('validates evidence and canonicalizes portfolio links', () => {
  assert.equal(portfolioProjectSchema.parse({ ...sampleProject, url: 'https://project.example' }).url, 'https://project.example/');
  assert.equal(portfolioProjectSchema.safeParse({ ...sampleProject, url: 'https://person:secret@project.example' }).success, false);
  assert.equal(portfolioProjectSchema.safeParse({ ...sampleProject, claims: [{ kind: 'screenshot', statement: 'Catalogue', evidence: 'Owner screenshot', approved: true }] }).success, false);
  assert.equal(portfolioProjectSchema.safeParse({ ...sampleProject, claims: [{ kind: 'feature', statement: 'Catalogue', evidence: '', approved: true }] }).success, false);
});

test('uses the saved sender and approved reference while preserving draft provenance', async (context) => {
  const initial = await getBusinessKnowledge();
  assert.equal(initial.profile.displayName, profileName);
  assert.equal(initial.projects.some((project) => project.shareable), false);

  const mock = context.mock.method(geminiService, 'generateOutreach', async () => ({
    subject: 'Project enquiry', body: 'Generated candidate draft.', personalisedOpening: 'Hello there,',
    observedOpportunity: 'I inspected your website and ran a case study at https://fake-proof.example/', relevantService: 'Unverified services',
    valueProposition: 'Our clients got a 98% improvement.', callToAction: 'Would you like to talk through the scope?',
    professionalClosing: 'Another name', messageType: 'COLD_EMAIL',
    followUpSequence: [{ delayDays: 3, subject: 'Re: project enquiry', body: 'Invented past case study.' }],
    generatedBy: 'gemini' as const, model: 'fixture', isFallback: false,
  }));
  const input = { companyName: 'Business fixture', targetService: 'E-commerce website', messageType: 'COLD_EMAIL', freelancerName: 'Old sender' };
  const general = await generateProfileOutreach(input);
  assert.equal(general.businessProfile.reference.projectId, null);
  assert.match(general.body, /https:\/\/sravan-kumar-portfolio-sepia.vercel.app\//);

  const saved = await createPortfolioProject(sampleProject);
  const draft = await generateProfileOutreach(input);
  assert.equal(draft.generatedBy, 'gemini');
  assert.equal(draft.isFallback, false);
  assert.equal(draft.businessProfile.reference.projectId, saved.id);
  assert.equal(draft.businessProfile.reference.revision, saved.revision);
  assert.match(draft.body, /Sravan Kumar Naredla/);
  assert.match(draft.body, /The demo shows a product catalogue/);
  assert.doesNotMatch(draft.body, /Old sender|Another name|Unverified payment|inspected your site|fake-proof|98%/);
  assert.doesNotMatch(draft.followUpSequence[0].body, /Invented past case study/);
  assert.equal(mock.mock.callCount(), 2);

  await savePortfolioProject(saved.id, { archivedAt: new Date() }, saved.revision);
  const archived = await generateProfileOutreach(input);
  assert.equal(archived.businessProfile.reference.projectId, null);
  assert.equal(draft.businessProfile.reference.projectId, saved.id);
  const connection = await generateProfileOutreach({ ...input, messageType: 'LINKEDIN_CONNECT' });
  assert.ok(connection.body.length <= 300);
  assert.match(connection.body, /Sravan Kumar Naredla/);
});

test('requires the latest revision for business profile edits', async () => {
  const { profile } = await getBusinessKnowledge();
  const input = businessProfileSchema.parse(profile);
  const first = await saveBusinessProfile({ ...input, defaultCurrency: 'USD' }, profile.revision);
  assert.equal(first.revision, profile.revision + 1);
  assert.equal((await getBusinessKnowledge()).profile.defaultCurrency, 'USD');
  await assert.rejects(saveBusinessProfile(input, profile.revision), ConflictError);
});
