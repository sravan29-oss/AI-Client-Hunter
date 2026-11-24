import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { geminiService } from '../services/gemini';
import type { WebsiteEvidence } from '../services/scraper';

const input = { companyName: 'Fixture company', targetService: 'Business website', messageType: 'COLD_EMAIL' };
const correct = {
  subject: 'Project collaboration', body: 'A complete outreach draft.',
  personalisedOpening: 'Hello', observedOpportunity: 'Opportunity for a review',
  relevantService: 'Business website', valueProposition: 'Clearer customer journeys',
  callToAction: 'Would you be open to a call?', professionalClosing: 'Thanks',
};
let service: typeof geminiService;

before(async () => {
  process.env.GEMINI_API_KEY = 'phase15-test-key';
  process.env.GEMINI_MODEL = 'phase15-fixture-model';
  service = (await import('../services/gemini')).geminiService;
});

describe('Gemini generation provenance', () => {
  it('accepts only measured opportunity IDs and excludes untrusted website content from Gemini requests', async (t) => {
    const { analyzeOpportunities } = await import('../services/discovery/opportunityAnalysis');
    let response = { orderedEvidenceIds: ['metadata'] };
    const transport = t.mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', () => ({
      generateContent: async (prompt: string) => {
        assert.doesNotMatch(prompt, /UNTRUSTED_PAGE_INSTRUCTION/);
        assert.match(prompt, /metadata/);
        return { response: { text: () => JSON.stringify(response) } };
      },
    }));
    const evidence = {
      isResponsiveReady: false, hasViewport: false, isHttps: true, pageTitleStatus: 'optimal', statusCode: 200,
      metaDescriptionStatus: 'missing', hasContactForm: true, imagesMissingAltCount: 0,
      bodySample: 'UNTRUSTED_PAGE_INSTRUCTION',
    } as WebsiteEvidence;
    const record = { businessName: 'Fixture', country: 'India', industry: 'Restaurants', services: ['Website development'],
      inspection: { status: 'ANALYZED' as const, evidence, inspectedAt: new Date().toISOString(), cached: false } };
    const valid = await analyzeOpportunities(record);
    assert.equal(valid.generatedBy, 'gemini');
    assert.equal(valid.opportunities[0].id, 'metadata');
    assert.equal(valid.budgetRange, null);
    response = { orderedEvidenceIds: ['invented-checkout-problem'] };
    const invalid = await analyzeOpportunities(record);
    assert.equal(invalid.generatedBy, 'evidence_fallback');
    assert.deepEqual(invalid.opportunities.map((finding) => finding.id), ['viewport', 'metadata']);
    assert.equal(transport.mock.callCount(), 2);
  });
  it('records the configured model for validated Gemini output', async (t) => {
    t.mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', () => ({
      generateContent: async () => ({ response: { text: () => JSON.stringify(correct) } }),
    }));
    const draft = await service.generateOutreach(input);
    assert.equal(draft.body, correct.body);
    assert.equal(draft.generatedBy, 'gemini');
    assert.equal(draft.model, 'phase15-fixture-model');
    assert.equal(draft.isFallback, false);
  });

  for (const output of ['not valid JSON', JSON.stringify({ ...correct, body: '   ' }), '']) {
    it('uses a complete local draft after invalid or empty Gemini content', async (t) => {
      t.mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', () => ({
        generateContent: async () => ({ response: { text: () => output } }),
      }));
      t.mock.method(axios, 'post', async () => ({ data: { candidates: [] } }));
      const draft = await service.generateOutreach(input);
      assert.ok(draft.body.trim());
      assert.equal(draft.generatedBy, 'evidence_fallback');
      assert.equal(draft.model, null);
      assert.equal(draft.isFallback, true);
    });
  }

  for (const failure of [401, 403, 'ECONNABORTED'] as const) {
    it('returns a nonempty fallback without a second Gemini transport request', async (t) => {
      const sdk = t.mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', () => ({
        generateContent: async () => { throw { status: failure, response: { data: 'SDK secret fixture' } }; },
      }));
      const rest = t.mock.method(axios, 'post', async () => {
        throw { isAxiosError: true, code: typeof failure === 'string' ? failure : undefined,
          response: typeof failure === 'number' ? { status: failure, data: 'REST secret fixture' } : undefined };
      });
      const draft = await service.generateOutreach(input);
      assert.ok(draft.body.trim());
      assert.equal(draft.isFallback, true);
      assert.equal(draft.generatedBy, 'evidence_fallback');
      const report = await service.auditWebsite({ websiteUrl: 'https://fixture.example', companyName: 'Fixture' });
      assert.equal(report.isFallback, true);
      assert.equal(report.model, null);
      assert.equal(sdk.mock.callCount(), 1);
      assert.equal(rest.mock.callCount(), 0);
    });
  }
});
