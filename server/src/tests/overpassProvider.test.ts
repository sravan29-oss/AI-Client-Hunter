import assert from 'node:assert/strict';
import { test } from 'node:test';
import axios, { type AxiosRequestConfig } from 'axios';
import { DiscoveryService } from '../services/discovery/discoveryService';
import { OverpassProvider } from '../services/discovery/providers/OverpassProvider';
import { makeOverpassQuery } from '../services/discovery/providers/overpassQuery';
import { ProviderFailure } from '../services/discovery/providerErrors';
import { setDirectoryLimit } from '../services/discovery/directoryUsage';

setDirectoryLimit('overpass', 120);

const endpoint = 'https://directory.example/api/interpreter';
const input = { city: 'Bonn', country: 'DE', industry: 'Restaurants', maxLeads: 5 };
const area = { type: 'area', id: 3600000080 };
const mappedNode = { type: 'node', id: 125, lat: 50.73, lon: 7.1, tags: {
  name: 'Restaurant fixture', amenity: 'restaurant', 'contact:website': 'restaurant.example',
  'contact:phone': '+49 000', email: 'info@restaurant.example', 'addr:street': 'Fixture Street', 'addr:housenumber': '7',
} };

test('Overpass bounds supported categories and exact tags by city and country', () => {
  const query = makeOverpassQuery({ ...input, osmTags: [{ key: 'amenity', value: 'restaurant' }] }).query;
  assert.match(query, /ISO3166-1"="DE"/);
  assert.match(query, /rel\(area.country\).*\["name"="Bonn"\]/);
  assert.match(query, /map_to_area ->\.cityAreas/);
  assert.match(query, /nwr\(area.cityAreas\).*\["amenity"="restaurant"\]/);
  assert.match(query, /out center qt 15;/);
  for (const industry of ['Retail stores', 'Hotels', 'Offices', 'Healthcare businesses', 'Education', 'Local service providers']) {
    assert.match(makeOverpassQuery({ ...input, industry }).query, /nwr\(area.cityAreas\)/);
  }
  assert.throws(() => makeOverpassQuery({ ...input, city: undefined }), /requires both a city and country/);
  assert.throws(() => makeOverpassQuery({ ...input, osmTags: [{ key: 'name', value: 'Test' }] }), /valid OSM/);
});

test('maps real-format OSM fields without filling missing contacts and coalesces identical queries', async (context) => {
  const request = context.mock.method(axios, 'post', async (url: string, body: string, options: AxiosRequestConfig) => {
    assert.equal(url, endpoint);
    assert.equal(options.maxRedirects, 0);
    assert.match(new URLSearchParams(body).get('data') || '', /nwr\(area.cityAreas\)/);
    return { data: { elements: [area, mappedNode, mappedNode, { type: 'way', id: 125, center: { lat: 50.7, lon: 7.1 }, tags: { name: 'Second fixture' } }] } };
  });
  const provider = new OverpassProvider(endpoint, 0);
  const [first, second] = await Promise.all([provider.search(input), provider.search(input)]);
  assert.deepEqual(first, second);
  assert.equal(first.totalFound, 2);
  const [documented, missing] = first.leads;
  assert.deepEqual(documented.osmObject, { type: 'node', id: 125 });
  assert.deepEqual(missing.osmObject, { type: 'way', id: 125 });
  assert.deepEqual(documented.metadata?.coordinates, { lat: 50.73, lon: 7.1 });
  assert.deepEqual(missing.metadata?.coordinates, { lat: 50.7, lon: 7.1 });
  assert.deepEqual(documented.metadata?.address, { street: 'Fixture Street', housenumber: '7' });
  assert.equal(documented.website, 'https://restaurant.example/');
  assert.equal(documented.publicBusinessPhone, '+49 000');
  assert.equal(documented.businessEmail, 'info@restaurant.example');
  assert.equal(documented.contactStatus.emailStatus, 'unverified');
  assert.equal(missing.website, null);
  assert.equal(missing.publicBusinessPhone, null);
  assert.equal(missing.businessEmail, null);
  assert.match(documented.source, /OpenStreetMap contributors/);
  assert.ok(!Number.isNaN(Date.parse(documented.discoveryDate)));
  first.leads[0].businessName = 'Mutated caller copy';
  assert.deepEqual(await provider.search(input), second);
  assert.equal(request.mock.callCount(), 1);
});

test('honors Retry-After and reports a rate-limited health check without contacting the endpoint again', async (context) => {
  const request = context.mock.method(axios, 'post', async () => {
    throw { isAxiosError: true, response: { status: 429, headers: { 'retry-after': '120' }, data: 'private response' } };
  });
  const provider = new OverpassProvider(endpoint, 0);
  await assert.rejects(provider.search(input), (error) => error instanceof ProviderFailure && error.kind === 'rate_limit');
  const status = await provider.checkHealth(true);
  assert.equal(status.connectionState, 'rate_limited');
  assert.doesNotMatch(JSON.stringify(status), /private response/);
  assert.equal(request.mock.callCount(), 1);
});

test('retries a transient failure once and distinguishes a missing city boundary from empty results', async (context) => {
  let calls = 0;
  context.mock.method(axios, 'post', async () => {
    calls++;
    if (calls === 1) throw { isAxiosError: true, response: { status: 503 } };
    return { data: { elements: calls === 2 ? [area] : [] } };
  });
  const provider = new OverpassProvider(endpoint, 0);
  assert.equal((await provider.search(input)).totalFound, 0);
  assert.equal(calls, 2);
  await assert.rejects(provider.search({ ...input, city: 'Unknown Municipality' }), /No mapped administrative boundary/);
  assert.equal(calls, 3);
});

test('keeps address geocoding separate and migrates the saved discovery alias', async (context) => {
  const probe = context.mock.method(axios, 'post', async (_url: string, body: string) => {
    assert.match(new URLSearchParams(body).get('data') || '', /out count/);
    return { data: { elements: [{ type: 'count', tags: { total: '1' } }] } };
  });
  const service = new DiscoveryService();
  service.registerProvider(new OverpassProvider(endpoint, 0));
  assert.equal(service.getProvider('openstreetmap')?.id, 'overpass');
  assert.equal(service.getProvider('nominatim'), undefined);
  assert.equal(service.getProviders().find((provider) => provider.id === 'nominatim')?.purpose, 'address_geocoding');
  await assert.rejects(service.search({ ...input, providerId: 'nominatim' }), /Unknown search provider/);
  assert.equal((await service.checkProviderHealth('overpass')).connectionState, 'connected');
  assert.equal(probe.mock.callCount(), 1);
});
