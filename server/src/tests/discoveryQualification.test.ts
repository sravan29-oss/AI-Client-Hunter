import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enrichBusiness, inspectListedWebsite } from '../services/discovery/businessEnrichment';
import { classifyLeadScore, measuredOpportunities } from '../services/discovery/opportunityAnalysis';
import { scraperService, type WebsiteEvidence } from '../services/scraper';
import type { DiscoveredLead } from '../services/discovery/types';
import { WebsiteHttpError } from '../utils/ssrfProtection';
import { takeGeminiRequest, withDiscoveryBudget } from '../services/discovery/directoryUsage';
import { generateLocalAuditSynthesis } from '../services/gemini';

const lead: DiscoveredLead = {
  businessName: 'Enrichment test fixture', website: 'https://example.com', country: 'India', city: 'Pune', industry: 'Restaurants',
  source: 'Fixture', providerId: 'test', providerName: 'Test', discoveryDate: '2026-11-22T15:00:00.000Z',
  detectedProblems: [], suggestedServices: [], opportunityScore: 0,
  contactStatus: { websiteStatus: 'unverified', emailStatus: 'unavailable', phoneStatus: 'unavailable' },
  listingEvidence: { address: 'Fixture Road', sourceReference: 'test-ref', categories: ['restaurant'] },
};
const evidence = {
  url: 'https://example.com/', finalUrl: 'https://example.com/', statusCode: 200, isHttps: true, hasViewport: true, isResponsiveReady: true,
  publicContacts: [], emailsFound: ['wrong value', 'hello@example.com'], phonesFound: ['+1 202 555 0143'],
  socialLinks: { linkedin: 'https://www.linkedin.com/company/example', invalid: 'javascript:void(0)' },
  pageTitleStatus: 'optimal', metaDescriptionStatus: 'missing', imagesMissingAltCount: 0, emptyNavLinksCount: 0, hasContactForm: true,
} as unknown as WebsiteEvidence;

test('enriches only observed public contacts and rejects contact details from a different redirect host', () => {
  const enriched = enrichBusiness(lead, { status: 'ANALYZED', evidence, inspectedAt: lead.discoveryDate, cached: false });
  assert.equal(enriched.fields.address?.source, 'test-ref');
  assert.equal(enriched.businessEmail, 'hello@example.com');
  assert.equal(enriched.fields.email?.source, evidence.finalUrl);
  assert.equal(enriched.publicBusinessPhone, '+1 202 555 0143');
  assert.equal(enriched.socialLinks.length, 1);
  const differentSite = enrichBusiness(lead, { status: 'ANALYZED', evidence: { ...evidence, finalUrl: 'https://elsewhere.example' }, inspectedAt: lead.discoveryDate, cached: false });
  assert.equal(differentSite.businessEmail, null);
  assert.equal(differentSite.publicBusinessPhone, null);
});

test('keeps HTTP failures separate from analyzed pages and does not invent absent features', async (context) => {
  for (const status of [403, 404, 500]) {
    const mock = context.mock.method(scraperService, 'scrapeUrl', async () => { throw new WebsiteHttpError(status); });
    const result = await inspectListedWebsite(lead.website);
    assert.equal(result.status, 'FAILED');
    if (result.status === 'FAILED') assert.equal(result.httpStatus, status);
    mock.mock.restore();
  }
  assert.deepEqual(await inspectListedWebsite(null), { status: 'NOT_LISTED' });
  assert.deepEqual(measuredOpportunities(), []);
  assert.deepEqual(measuredOpportunities(evidence).map((finding) => finding.id), ['metadata']);
  assert.deepEqual(generateLocalAuditSynthesis({ websiteUrl: 'https://example.com' }).missingFeatures, []);
  assert.deepEqual([49, 50, 69, 70, 84, 85, 100].map(classifyLeadScore),
    ['Not Qualified', 'Potential Prospect', 'Potential Prospect', 'Strong Prospect', 'Strong Prospect', 'High Priority', 'High Priority']);
});

test('enforces the configured per-run Gemini transport allowance', async () => {
  const budget = { directoryRequests: 0, geminiRequests: 0, geminiLimit: 1 };
  assert.deepEqual(await withDiscoveryBudget(budget, () => Promise.all([takeGeminiRequest(), takeGeminiRequest(), takeGeminiRequest()])), [true, false, false]);
  assert.equal(budget.geminiRequests, 1);
});
