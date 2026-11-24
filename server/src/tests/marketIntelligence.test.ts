import assert from 'node:assert/strict';
import { test } from 'node:test';
import { businessGrowthPeriods, businessRangeSchema } from '../services/businessGrowthCalendar';
import { targetingSchema } from '../services/idealProfileTypes';
import { evaluateLeadPriority, verifiedLeadLocation, type PriorityLead } from '../services/leadPriority';
import { latestRecordedResponses, summarizeMarketIntelligence } from '../services/marketIntelligence';

const now = new Date('2026-11-24T10:00:00Z');
const measuredAt = new Date('2026-11-23T10:00:00Z');
const offerings = ['Website development', 'Website redesign and UI/UX', 'Backend API development', 'AI application development'];
const source = { providerId: 'google_places', reference: 'fixture-place', sourceUrl: 'https://source.example/listing' };
const partial: PriorityLead = {
  id: 'partial', businessName: 'Fixture', city: 'Hyderabad', country: 'India', industry: '',
  website: null, leadStatus: 'New', qualificationStatus: null, qualificationScore: null,
  createdAt: measuredAt, discoveryEvidence: null, discoverySources: [], audits: [], pitches: [], followUps: [], communicationPolicies: [],
};
const target = targetingSchema.parse({
  locations: [{ country: 'India', city: 'Hyderabad' }], industries: ['Travel'], services: ['Website development'], minLeadScore: 40,
});
const scored: PriorityLead = {
  ...partial, id: 'measured', businessName: 'Measured fixture', industry: 'Travel', website: 'https://business.example',
  leadStatus: 'Qualified', qualificationStatus: 'QUALIFIED', qualificationScore: 77,
  discoveryEvidence: { fields: {
    country: { value: 'IN', source: source.reference }, city: { value: 'Hyderabad', source: source.reference },
    category: { value: 'Tour agency, Travel', source: source.reference },
  } },
  discoverySources: [source, { ...source, reference: 'fixture-second' }],
  audits: [{ websiteUrl: 'https://business.example', rawData: {
    evidence: { finalUrl: 'https://business.example', statusCode: 200, isResponsiveReady: false, imagesMissingAltCount: 2 },
  } }],
  pitches: [{ proposal: { currency: 'USD', totalMinor: 1000, lines: [{ serviceKey: 'backend_api' }] },
    status: 'SENT', createdAt: measuredAt, sentAt: measuredAt }],
  followUps: [{ dueAt: measuredAt }],
};
const input = { offerings, targeting: target, now, response: { kind: 'INTERESTED', date: now } };

test('derives a reproducible score, breaks it into documented factors and credits a provider only once', () => {
  const result = evaluateLeadPriority(scored, input);
  assert.deepEqual(result, evaluateLeadPriority(scored, input));
  assert.equal(result.score, 100);
  assert.equal(result.category, 'high');
  assert.equal(result.sourceCount, 1);
  assert.equal(result.increases.filter(({ code }) => code === 'source').length, 1);
  assert.equal(result.increases.reduce((sum, item) => sum + item.points, 0), result.score);
  assert.equal(result.decreases.length, 0);
  assert.match(result.nextAction, /pending follow-up/);
  assert.deepEqual(result.services.map(({ service, source }) => [service, source]), [
    ['Website redesign and UI/UX', 'website'], ['Backend API development', 'proposal'],
  ]);
});

test('keeps missing website, invalid audit, unsent quotes, and unverified address out of recommendations', () => {
  const missing = evaluateLeadPriority(partial, { offerings, targeting: target, now });
  assert.equal(missing.category, 'insufficient');
  assert.equal(missing.score, 0);
  assert.equal(missing.location, null);
  assert.deepEqual(missing.services, []);
  assert(missing.missing.includes('Verified website availability'));
  const stale = evaluateLeadPriority({
    ...scored, website: 'https://different.example', pitches: scored.pitches.map((pitch) => ({ ...pitch, status: 'DRAFT', sentAt: null })),
    discoveryEvidence: { fields: { city: { value: 'Hyderabad', source: 'unrelated' } } },
  }, { ...input, offerings: ['AI application development'] });
  assert.equal(stale.location, null);
  assert.deepEqual(stale.services, []);
  assert(!stale.increases.some(({ code }) => code === 'websiteObservation'));
  assert(stale.missing.includes('Measured website inspection for the current site'));
});

test('uses only provider-corroborated location and prioritizes an opt-out over later CRM review steps', () => {
  assert.deepEqual(verifiedLeadLocation(scored), { city: 'Hyderabad', country: 'India', countryCode: 'IN' });
  assert.equal(verifiedLeadLocation({ ...scored, city: 'Warangal' })?.city, null);
  assert.equal(verifiedLeadLocation({ ...scored, country: 'United States' }), null);
  const legacyAddress = { value: 'Example Road, Hyderabad, Telangana 500001, India', source: source.reference };
  const legacy = { ...scored, discoveryEvidence: { fields: { address: legacyAddress } } };
  assert.equal(verifiedLeadLocation(legacy)?.city, 'Hyderabad');
  assert.equal(verifiedLeadLocation({ ...legacy, discoveryEvidence: { fields: {
    address: legacyAddress, city: { value: 'Warangal', source: source.reference },
  } } })?.city, null);
  assert.equal(verifiedLeadLocation({ ...legacy, discoveryEvidence: { fields: {
    address: { ...legacyAddress, source: 'unrelated' },
  } } }), null);
  const response = latestRecordedResponses([
    { key: scored.id, kind: 'QUESTION', occurredAt: now.toISOString(), sentAt: measuredAt },
    { key: scored.id, kind: 'OPT_OUT', occurredAt: now.toISOString(), sentAt: measuredAt },
    { key: 'future', kind: 'INTERESTED', occurredAt: '2099-01-01T00:00:00Z', sentAt: measuredAt },
    { key: 'wrong-date', kind: 'OTHER', occurredAt: 'invalid', sentAt: measuredAt },
  ], now);
  assert.equal(response.size, 1);
  const blocked = evaluateLeadPriority(scored, { ...input, response: response.get(scored.id) });
  assert.equal(blocked.decreases[0].points, -20);
  assert.match(blocked.nextAction, /restriction/);
  assert(!blocked.increases.some(({ code }) => code === 'response'));
});

test('aggregates canonical industry and verified-location cohorts with minimum denominators and period-bound events', () => {
  const period = businessGrowthPeriods(businessRangeSchema.parse({ range: 'last7' }), 'Asia/Kolkata', now);
  const cohort = Array.from({ length: 10 }, (_, i) => ({
    ...scored, id: 'known-' + i, businessName: 'Known ' + i, industry: i % 2 ? 'Travel' : ' travel ',
  }));
  const transitions = cohort.map((lead, index) => ({ id: lead.id, key: lead.id,
    createdAt: measuredAt, from: 'Negotiation', to: index < 4 ? 'Won' : 'Lost' }));
  const base = { period, now, offerings, targeting: target, responses: new Map(), transitions };
  const report = summarizeMarketIntelligence({
    ...base, leads: [...cohort, cohort[0], partial, { ...partial, id: 'outside', createdAt: period.current.end }],
  });
  assert.equal(report.coverage.leads, 11);
  assert.equal(report.coverage.verifiedCity, 10);
  assert.equal(report.coverage.withProvider, 10);
  assert.equal(report.industries[0].leads, 10);
  assert.equal(report.industries[0].qualified, 10);
  assert.equal(report.industries[0].proposals, 10);
  assert.equal(report.industries[0].winRate, 40);
  assert.equal(report.locations[0].winRate, 40);
  assert.equal(report.locations[1].label, 'Location unverified');
  assert.equal(Object.values(report.industryTrend.points[5].counts).reduce((a, b) => a + b, 0), 11);
  const small = summarizeMarketIntelligence({ ...base, leads: cohort.slice(0, 9), transitions: transitions.slice(0, 9) });
  assert.equal(small.industries[0].qualificationRate, null);
  assert.equal(small.industries[0].winRate, null);
  assert.equal(small.locations[0].won, null);
});
