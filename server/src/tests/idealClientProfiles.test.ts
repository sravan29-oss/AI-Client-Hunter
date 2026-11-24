import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBusinessKnowledge } from '../services/businessKnowledge';
import { idealProfileSchema, profileSnapshotSchema } from '../services/idealProfileTypes';
import { matchesProfileFilters, scoreProfileMatch } from '../services/discovery/profileMatching';
import { makeOverpassQuery } from '../services/discovery/providers/overpassQuery';
import type { DiscoveredLead } from '../services/discovery/types';
import axios from 'axios';
import { classifyProviderError } from '../services/discovery/providerErrors';

const targeting = {
  industries: ['Restaurants', 'Retail stores'], services: ['Business website'], categories: ['Italian restaurant'],
  companySizes: ['11–50'], preferredBusinessTypes: ['Independent'], minProjectBudget: { amount: 1500, currency: 'USD' }, minLeadScore: 50,
};

test('normalizes countries and cities, rejects duplicate cities and validates local schedules', () => {
  const input = { name: 'Targeting fixture', targeting: { ...targeting, locations: [
    { country: ' uk ', city: ' london ', schedule: { mode: 'WEEKLY', time: '09:30', timezone: 'Europe/London' } },
    { country: 'GB', city: 'Manchester' }, { country: 'India', city: 'bangalore' },
  ] } };
  const profile = idealProfileSchema.parse(input);
  assert.deepEqual(profile.targeting.locations.map(({ countryCode, city }) => [countryCode, city]), [['GB', 'London'], ['GB', 'Manchester'], ['IN', 'Bengaluru']]);
  assert.equal(idealProfileSchema.safeParse({ ...input, targeting: { ...input.targeting, locations: [...input.targeting.locations, { country: 'United Kingdom', city: 'LONDON' }] } }).success, false);
  assert.equal(idealProfileSchema.safeParse({ ...input, targeting: { ...input.targeting, locations: [{ country: 'Europe', city: 'London' }] } }).success, false);
  assert.equal(idealProfileSchema.safeParse({ ...input, targeting: { ...input.targeting, locations: [{ country: 'IN', city: 'Pune, Mumbai' }] } }).success, false);
  assert.equal(idealProfileSchema.safeParse({ ...input, targeting: { ...input.targeting, locations: [{ country: 'IN', city: '', radius: { latitude: 0, longitude: 0, km: 8 } }] } }).success, false);
  assert.equal(idealProfileSchema.safeParse({ ...input, targeting: { ...input.targeting, locations: [{ country: 'IN', city: 'Pune', schedule: { mode: 'DAILY', time: '29:00', timezone: 'Invalid/Zone' } }] } }).success, false);
});

const london = profileSnapshotSchema.parse({ profileId: 'fixture', profileName: 'Targets', revision: 1, location: { country: 'GB', city: 'London' }, targeting });
const listing: DiscoveredLead = {
  businessName: 'Restaurant test fixture', source: 'Provider fixture', providerId: 'serpapi', providerName: 'Fixture', country: 'United Kingdom', city: 'London',
  industry: 'Restaurants', discoveryDate: '2026-11-22T07:00:00Z', detectedProblems: [], suggestedServices: [], opportunityScore: 0,
  contactStatus: { websiteStatus: 'unavailable', emailStatus: 'unavailable', phoneStatus: 'unavailable' },
  listingEvidence: { address: '1 Fixture Road, London, United Kingdom', categories: ['Italian restaurant'] },
};

test('filters on source locations, industries, categories, and documented size and budget', () => {
  assert.equal(matchesProfileFilters(listing, london, 'Restaurants'), true);
  const pluralCategory = { ...london, targeting: { ...london.targeting, categories: ['Italian restaurants'] } };
  assert.equal(matchesProfileFilters(listing, pluralCategory, 'Restaurants'), true);
  assert.equal(matchesProfileFilters({ ...listing, listingEvidence: undefined }, london, 'Restaurants'), false);
  assert.equal(matchesProfileFilters({ ...listing, listingEvidence: { ...listing.listingEvidence, city: 'Birmingham' } }, london, 'Restaurants'), false);
  assert.equal(matchesProfileFilters({ ...listing, listingEvidence: { ...listing.listingEvidence, countryCode: 'US' } }, london, 'Restaurants'), false);
  assert.equal(matchesProfileFilters(listing, london, 'Hotels'), false);
  assert.equal(matchesProfileFilters({ ...listing, listingEvidence: { ...listing.listingEvidence, categories: ['Thai restaurant'] } }, london, 'Restaurants'), false);
  assert.equal(matchesProfileFilters({ ...listing, listingEvidence: { ...listing.listingEvidence, employeeCount: 5 } }, london, 'Restaurants'), false);
  assert.equal(matchesProfileFilters({ ...listing, listingEvidence: { ...listing.listingEvidence, budget: { amount: 400, currency: 'USD' } } }, london, 'Restaurants'), false);
});

test('uses country bounds and radius in Overpass and checks returned coordinates', () => {
  const radius = profileSnapshotSchema.parse({ ...london, location: { country: 'GB', city: 'London', radius: { latitude: 51.5, longitude: -0.1, km: 5 } } });
  const query = makeOverpassQuery({ country: 'United Kingdom', city: 'London', industry: 'Restaurants', maxLeads: 1, profileSnapshot: radius }).query;
  assert.match(query, /\["ISO3166-1"="GB"\]/);
  assert.match(query, /nwr\(area.cityAreas\)\(around:5000,51.5,-0.1\)/);
  const mapped = { ...listing, providerId: 'overpass', listingEvidence: { mappedBoundary: true, categories: ['Italian restaurant'], coordinates: { lat: 51.5, lon: -0.1 } } };
  assert.equal(matchesProfileFilters(mapped, radius, 'Restaurants'), true);
  assert.equal(matchesProfileFilters({ ...mapped, listingEvidence: { ...mapped.listingEvidence, coordinates: { lat: 51.8, lon: -0.1 } } }, radius, 'Restaurants'), false);
});

test('scores saved services and approved portfolio evidence while recording unknown business facts', async () => {
  const knowledge = await getBusinessKnowledge();
  const plain = scoreProfileMatch(listing, london, 'Restaurants', knowledge);
  assert.equal(plain.service, 'Website development');
  assert.deepEqual(plain.unknown, ['Company size', 'Project budget', 'Website condition', 'Business type']);
  assert.equal(plain.issues.length, 0);
  assert.equal(plain.factors.find((part) => part.label === 'Website condition')?.points, 0);
  assert.equal(plain.factors.find((part) => part.label === 'Service compatibility')?.points, 20);
  const approved = { ...knowledge, projects: knowledge.projects.map((project) => ({ ...project, shareable: true, claims: project.claims.map((claim) => ({ ...claim, approved: true })) })) };
  const withProject = scoreProfileMatch(listing, london, 'Restaurants', approved);
  assert.equal(withProject.score, plain.score + 5);
  assert.ok(withProject.portfolioProjectId);
  assert.equal(classifyProviderError('serpapi', new axios.AxiosError('limit', undefined, undefined, undefined, { status: 429, headers: { 'retry-after': '90' } } as any)).retryAfterMs, 90000);
});
