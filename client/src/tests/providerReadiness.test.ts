import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadinessView } from '../components/ProviderReadinessPanel';
import type { ReadinessDashboard } from '../types/providerReadiness';

test('Settings displays withheld acceptance, provider diagnostics, timestamps and a scoped city selector', () => {
  const checked = '2026-11-23T06:39:05.977Z';
  const failed = { id: 'check', startedAt: checked, finishedAt: checked, status: 'failed', message: 'Google denied access.',
    reason: 'PERMISSION_DENIED', httpStatus: 403, locationKey: null, leadId: null, evidence: null };
  const data: ReadinessDashboard = { databaseAvailable: true, acceptance: 'withheld', leads: [],
    locations: [{ key: 'IN:hyderabad', city: 'Hyderabad', country: 'India' }],
    providers: [{ id: 'google_places', setting: 'GOOGLE_PLACES_API_KEY', configured: true, enabled: true, issue: null,
      state: 'failed', passed: false, latest: failed, history: [failed], lastSuccessAt: null },
    { id: 'overpass', setting: 'OSM_OVERPASS_URL', configured: false, enabled: true, issue: 'Set OSM_OVERPASS_URL on the backend.',
      state: 'missing_configuration', passed: false, latest: null, history: [], lastSuccessAt: null }] };
  const noop = () => {};
  const html = renderToStaticMarkup(createElement(ReadinessView, { data, busy: null, error: '', selected: 'IN:hyderabad',
    lead: '', setLocation: noop, setLeadId: noop, run: noop }));
  for (const label of ['Phase 17 acceptance withheld', 'HTTP 403', 'PERMISSION_DENIED', 'Last verified successfully',
    'Missing configuration', 'Hyderabad, India', 'Recent checks']) assert(html.includes(label));
  assert.match(html, /disabled=""[^>]*>Test city query/);
  assert(!html.includes('Phase 17 acceptance passed'));
});
