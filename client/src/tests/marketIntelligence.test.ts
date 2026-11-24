import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarketIntelligenceContent } from '../components/MarketIntelligence';
import { LeadDiscoveryEvidence } from '../components/LeadDiscoveryEvidence';
import type { Lead } from '../types';
import type { MarketIntelligenceReport } from '../types/marketIntelligence';

const empty: MarketIntelligenceReport = {
  period: { from: '2026-11-18', to: '2026-11-24' }, timezone: 'Asia/Kolkata', asOf: '2026-11-24T10:00:00Z',
  provenance: 'evidence_fallback', rules: { version: 'crm-evidence-v1',
    weights: { profileFit: 35, opportunity: 25, salesActivity: 25, followUp: 15 }, high: 70, medium: 40, minimumSignals: 2 },
  minimumSample: 10, priority: [{ category: 'insufficient', count: 0 }], excludedClosed: 0,
  coverage: { leads: 0, withProvider: 0, withIndustry: 0, sourcedIndustry: 0, verifiedCountry: 0, verifiedCity: 0 },
  industries: [], locations: [], industryTrend: { series: [], points: [] }, recommendations: [],
};
const render = (report: MarketIntelligenceReport) =>
  renderToStaticMarkup(createElement(MarketIntelligenceContent, { report, onOpenLead: () => {} }));

test('states data coverage and uses empty sections with no chart for an empty cohort', () => {
  const html = render(empty);
  assert.match(html, /Deterministic evidence scoring/);
  assert.match(html, /No open leads are available/);
  assert.match(html, /require 10 dated closures/);
  assert.doesNotMatch(html, /recharts-wrapper|mailto:|wa\.me/);
});

test('renders the saved score explanation, supported service and original CRM action', () => {
  const html = render({ ...empty, priority: [{ category: 'medium', count: 1 }], recommendations: [{
    id: 'lead-1', businessName: 'Visible CRM record', industry: null, qualified: true, location: null, category: 'medium', score: 40,
    increases: [{ code: 'audit', points: 50, reason: 'Recorded mobile issue' }],
    decreases: [{ code: 'restriction', points: -10, reason: 'Recorded restriction' }],
    missing: ['Provider-verified city'], nextAction: 'Open the saved audit', sourceCount: 0,
    services: [{ service: 'Website redesign and UI/UX', evidence: ['Mobile issue on the inspected page'], source: 'website' }],
  }] });
  assert.match(html, /40\/100/);
  assert.match(html, /Recorded mobile issue/);
  assert.match(html, /-10 · Recorded restriction/);
  assert.match(html, /Provider-verified city/);
  assert.match(html, /Mobile issue on the inspected page/);
  assert.match(html, /aria-label="Open CRM lead Visible CRM record"/);
});

test('supports opening an older lead with only partial saved discovery evidence', () => {
  const lead = { businessName: 'Partial lead', source: 'Manual', discoveryEvidence: {
    fields: { country: { value: 'India', source: 'Saved provider record' } },
  } } as unknown as Lead;
  const html = renderToStaticMarkup(createElement(LeadDiscoveryEvidence, { lead }));
  assert.match(html, /Qualification evidence/);
  assert.match(html, /Saved provider record/);
  assert.doesNotMatch(html, /Evidence confidence/);
});
