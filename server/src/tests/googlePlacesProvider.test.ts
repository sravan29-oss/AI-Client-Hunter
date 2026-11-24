import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import axios, { type AxiosRequestConfig } from 'axios';
import { GooglePlacesProvider } from '../services/discovery/providers/GooglePlacesProvider';
import { ProviderFailure } from '../services/discovery/providerErrors';
import { profileSnapshotSchema } from '../services/idealProfileTypes';

const fixtureKey = 'places-fixture-key';
const legacyAccessDenied = { data: { status: 'REQUEST_DENIED', error_message: 'You are calling a legacy API that is not enabled.' } };
const filters = { country: 'India', city: 'Pune', industry: 'Restaurants', maxLeads: 1 };

function useFixtureKey(context: TestContext) {
  const previous = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = fixtureKey;
  context.after(() => {
    if (previous === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previous;
  });
}

test('uses Places API (New) when Google reports that Legacy is disabled', async (context) => {
  useFixtureKey(context);
  const legacy = context.mock.method(axios, 'get', async () => legacyAccessDenied);
  const modern = context.mock.method(axios, 'post', async (url: string, _body: unknown, options: AxiosRequestConfig) => {
    assert.equal(url, 'https://places.googleapis.com/v1/places:searchText');
    assert.equal(options.headers?.['X-Goog-Api-Key'], fixtureKey);
    assert.equal(options.maxRedirects, 0);
    if (options.headers?.['X-Goog-FieldMask'] === 'places.id') {
      return { data: { places: [{ id: 'fixture' }] } };
    }
    return { data: { places: [{
      id: 'fixture', displayName: { text: 'Places test listing' }, formattedAddress: 'Pune',
      websiteUri: 'https://example.com', nationalPhoneNumber: '000-000-0000',
      rating: 4, userRatingCount: 5, types: ['restaurant'],
    }] } };
  });

  const provider = new GooglePlacesProvider();
  assert.equal((await provider.checkHealth()).isHealthy, true);
  const result = await provider.search({ ...filters, websiteAvailability: 'has_website' });
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].businessName, 'Places test listing');
  assert.equal(result.leads[0].website, 'https://example.com');
  assert.equal(result.leads[0].publicBusinessPhone, '000-000-0000');
  assert.equal(legacy.mock.callCount(), 1);
  assert.equal(modern.mock.callCount(), 2);
});

test('checks later Places API (New) pages when the website filter skips a page', async (context) => {
  useFixtureKey(context);
  context.mock.method(axios, 'get', async () => legacyAccessDenied);
  const modern = context.mock.method(axios, 'post', async (_url: string, body: { pageSize: number; pageToken?: string }) => {
    assert.equal(body.pageSize, 20);
    if (body.pageToken === 'next') {
      return { data: { places: [{ id: 'second', displayName: { text: 'Matching listing' }, websiteUri: 'https://example.com' }] } };
    }
    return { data: { places: [{ id: 'first', displayName: { text: 'Skipped listing' } }], nextPageToken: 'next' } };
  });
  const result = await new GooglePlacesProvider().search({ ...filters, websiteAvailability: 'has_website' });
  assert.equal(result.leads[0]?.businessName, 'Matching listing');
  assert.equal(modern.mock.callCount(), 2);
});

test('preserves working legacy projects and does not retry general key rejection on the new endpoint', async (context) => {
  useFixtureKey(context);
  let data = { status: 'ZERO_RESULTS' };
  context.mock.method(axios, 'get', async () => ({ data }));
  const modern = context.mock.method(axios, 'post', async () => ({ data: {} }));
  const provider = new GooglePlacesProvider();
  assert.equal((await provider.checkHealth()).isHealthy, true);
  assert.equal((await provider.search(filters)).leads.length, 0);
  data = { status: 'REQUEST_DENIED' };
  await assert.rejects(provider.search(filters), (error) => error instanceof ProviderFailure && error.kind === 'authentication');
  assert.equal(modern.mock.callCount(), 0);
});

test('reports Google Cloud permission problems without exposing upstream details', async (context) => {
  useFixtureKey(context);
  context.mock.method(axios, 'get', async () => legacyAccessDenied);
  context.mock.method(axios, 'post', async () => {
    throw { isAxiosError: true, response: { status: 403, data: { key: fixtureKey } } };
  });
  const provider = new GooglePlacesProvider();
  const health = await provider.checkHealth();
  assert.equal(health.configured, true);
  assert.equal(health.isHealthy, false);
  assert.equal(health.connectionState, 'unavailable');
  assert.match(health.statusMessage, /HTTP 403.*did not identify a failed setting/);
  assert.ok(!JSON.stringify(health).includes(fixtureKey));
});

test('requires GOOGLE_PLACES_API_KEY and reports a verified quota failure', async (context) => {
  useFixtureKey(context);
  const previousAlias = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = fixtureKey;
  context.after(() => {
    if (previousAlias === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = previousAlias;
  });
  const request = context.mock.method(axios, 'get', async () => ({ data: { status: 'OVER_QUERY_LIMIT' } }));
  const provider = new GooglePlacesProvider();
  assert.equal(provider.getStatus().connectionState, 'not_tested');
  delete process.env.GOOGLE_PLACES_API_KEY;
  const missing = await provider.checkHealth(true);
  assert.equal(missing.connectionState, 'missing_configuration');
  assert.equal(missing.envVarKey, 'GOOGLE_PLACES_API_KEY');
  assert.equal(request.mock.callCount(), 0);
  process.env.GOOGLE_PLACES_API_KEY = fixtureKey;
  assert.equal((await provider.checkHealth(true)).connectionState, 'rate_limited');
});

const target = profileSnapshotSchema.parse({
  profileId: 'fixture', profileName: 'Fixture', revision: 1,
  location: { country: 'IN', city: 'Pune', radius: { latitude: 18.52, longitude: 73.85, km: 5 } },
  targeting: { industries: ['Restaurants'], services: ['Business website'], minLeadScore: 50 },
});

test('uses Nearby Search for a supported targeted radius, retains source evidence, and excludes closed listings', async (context) => {
  useFixtureKey(context);
  const legacy = context.mock.method(axios, 'get', async () => { throw Error('Unexpected Legacy request'); });
  const modern = context.mock.method(axios, 'post', async (url: string, body: any, options: AxiosRequestConfig) => {
    assert.equal(url, 'https://places.googleapis.com/v1/places:searchNearby');
    assert.deepEqual(body.includedTypes, ['restaurant']);
    assert.deepEqual(body.locationRestriction.circle, { center: { latitude: 18.52, longitude: 73.85 }, radius: 5000 });
    assert.equal(options.timeout, 8000);
    assert.match(String(options.headers?.['X-Goog-FieldMask']), /places\.businessStatus/);
    assert.doesNotMatch(String(options.headers?.['X-Goog-FieldMask']), /nextPageToken|places\.rating/);
    return { data: { places: [
      { id: 'closed', displayName: { text: 'Closed fixture' }, businessStatus: 'CLOSED_PERMANENTLY' },
      { id: 'open', displayName: { text: 'Nearby fixture' }, businessStatus: 'OPERATIONAL', types: ['restaurant'],
        googleMapsUri: 'https://maps.google.com/?cid=123', location: { latitude: 18.52, longitude: 73.85 },
        addressComponents: [{ longText: 'Pune', types: ['locality'] }, { shortText: 'IN', types: ['country'] }],
      },
    ] } };
  });
  const { leads } = await new GooglePlacesProvider().search({ ...filters, maxLeads: 5, profileSnapshot: target });
  assert.equal(legacy.mock.callCount(), 0);
  assert.equal(modern.mock.callCount(), 1);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].listingEvidence?.businessStatus, 'OPERATIONAL');
  assert.equal(leads[0].listingEvidence?.sourceReference, 'open');
  assert.equal(leads[0].listingEvidence?.city, 'Pune');
  assert.equal(leads[0].businessEmail, null);
  assert.deepEqual(leads[0].detectedProblems, []);
});

test('backs off transient Places API failures and does not retry a quota response', async (context) => {
  useFixtureKey(context);
  let status = 503;
  let attempts = 0;
  const request = context.mock.method(axios, 'post', async () => {
    attempts++;
    if (status === 503 && attempts === 2) return { data: { places: [] } };
    throw { isAxiosError: true, response: { status, headers: { 'retry-after': '30' } } };
  });
  const provider = new GooglePlacesProvider();
  const requestFilters = { ...filters, profileSnapshot: { ...target, location: { ...target.location, radius: null } } };
  assert.equal((await provider.search(requestFilters)).totalFound, 0);
  assert.equal(request.mock.callCount(), 2);
  status = 429;
  await assert.rejects(provider.search(requestFilters), (error) => error instanceof ProviderFailure && error.kind === 'rate_limit' && error.retryAfterMs === 30000);
  assert.equal(request.mock.callCount(), 3);
});
