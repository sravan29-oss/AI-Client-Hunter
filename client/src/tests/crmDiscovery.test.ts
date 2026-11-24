import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Lead } from '../types';
import { initialDiscoveryFilters, LEAD_STATUSES, matchesDiscoveryFilters } from '../utils/crmDiscovery';

const lead: Lead = {
  id: 'fixture', businessName: 'CRM fixture', city: 'Pune', industry: 'Restaurants', source: 'OpenStreetMap', discoveryDate: '2026-11-22T18:00:00.000Z',
  opportunityScore: 78, qualificationStatus: 'QUALIFIED', websiteAnalysisStatus: 'FAILED', leadStatus: 'Qualified',
  detectedProblems: [], suggestedServices: [], createdAt: '2026-11-22T18:00:00.000Z', updatedAt: '2026-11-22T18:00:00.000Z',
  discoverySources: [{ providerId: 'overpass', reference: 'node/1', firstDiscoveredAt: '2026-11-22T18:00:00.000Z', lastDiscoveredAt: '2026-11-22T18:00:00.000Z' }],
};

test('combines the CRM discovery filters with inclusive score and UTC date bounds', () => {
  const filter = { city: 'Pune', provider: 'overpass', website: 'FAILED', qualification: 'QUALIFIED', score: '78', discoveredAfter: '2026-11-22' };
  assert.equal(matchesDiscoveryFilters(lead, filter), true);
  assert.equal(matchesDiscoveryFilters(lead, { ...filter, city: 'Mumbai' }), false);
  assert.equal(matchesDiscoveryFilters(lead, { ...filter, website: 'ANALYZED' }), false);
  assert.equal(matchesDiscoveryFilters(lead, { ...filter, score: '79' }), false);
  assert.equal(matchesDiscoveryFilters(lead, { ...filter, discoveredAfter: '2026-11-23' }), false);
  assert.equal(matchesDiscoveryFilters({ ...lead, discoveryDate: null }, { ...initialDiscoveryFilters, discoveredAfter: '2026-11-22' }), false);
});

test('keeps historical leads visible and exposes manual interest stages', () => {
  const historical = { ...lead, qualificationStatus: null, websiteAnalysisStatus: null, discoverySources: [] };
  assert.equal(matchesDiscoveryFilters(historical, { ...initialDiscoveryFilters, provider: 'OpenStreetMap', website: 'UNKNOWN', qualification: 'UNASSESSED' }), true);
  assert.ok(LEAD_STATUSES.some(({ key }) => key === 'Interested'));
  assert.ok(LEAD_STATUSES.some(({ key, label }) => key === 'Not_Interested' && label === 'Not Interested'));
  assert.ok(LEAD_STATUSES.some(({ key }) => key === 'Archived'));
});
