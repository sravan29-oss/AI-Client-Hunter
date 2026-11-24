import assert from 'node:assert/strict';
import { test } from 'node:test';
import axios, { type AxiosRequestConfig } from 'axios';
import { config } from '../config';
import { getReadiness, groundedRanking, summarizeProvider, verifyGeneration, verifyReadiness } from '../services/providerReadiness';
import { googleDiagnostic, GoogleDiagnostic } from '../services/discovery/googleDiagnostic';
import { OverpassProvider } from '../services/discovery/providers/OverpassProvider';
import { GooglePlacesProvider } from '../services/discovery/providers/GooglePlacesProvider';
import { setDirectoryLimit } from '../services/discovery/directoryUsage';

setDirectoryLimit('overpass', 120);

const secret = 'private-fixture-value-do-not-return';
const configured = { configured: true, enabled: true, configHash: secret, issue: null };
const time = new Date('2026-11-23T00:00:00Z');
const check = { id: 'fixture', startedAt: time, finishedAt: time, status: 'verified', message: 'Fixture only.',
  reason: null, httpStatus: 200, evidence: null, locationKey: 'IN:hyderabad', leadId: null };

test('readiness never infers a pass from configuration or an earlier success after a failure', () => {
  assert.equal(summarizeProvider('google_places', configured, null, null, false, []).passed, false);
  assert.equal(summarizeProvider('gemini', configured, check, time, false, []).passed, false);
  assert.equal(summarizeProvider('gemini', configured, check, time, true, []).passed, true);
  const failed = summarizeProvider('google_places', configured, { ...check, status: 'failed' }, time, false, []);
  assert.equal(failed.passed, false);
  assert.equal(failed.lastSuccessAt, time);
  assert.equal(summarizeProvider('overpass', configured, check, time, false, []).state, 'target_changed');
  assert.equal(summarizeProvider('overpass', configured, check, time, false, ['IN:hyderabad']).passed, true);
  assert.equal(summarizeProvider('gemini', configured, { ...check, status: 'running' }, time, true, [], +time + 120001).state, 'interrupted');
  assert(!JSON.stringify(failed).includes(secret));
});

test('configuration-only dashboard is withheld without durable evidence and does not call a provider', async t => {
  const prev = config.GEMINI_API_KEY;
  const request = t.mock.method(axios, 'post', () => { throw Error('unexpected request'); });
  try {
    config.GEMINI_API_KEY = '';
    const missing = await getReadiness();
    assert.equal(missing.providers[0].state, 'missing_configuration');
    config.GEMINI_API_KEY = secret;
    const set = await getReadiness();
    assert.equal(set.providers[0].state, 'untested');
    assert.equal(set.acceptance, 'withheld');
    assert(!JSON.stringify(set).includes(secret));
    assert.equal(request.mock.callCount(), 0);
  } finally { config.GEMINI_API_KEY = prev; }
});

test('Google diagnostic output exposes only supported reasons, a safe HTTP status and a local message', () => {
  for (const [status, reason, label] of [[403,'SERVICE_DISABLED','disabled'],[403,'BILLING_DISABLED','billing'],
    [400,'API_KEY_INVALID','credentials'],[400,'INVALID_ARGUMENT','argument'],[403,'API_KEY_IP_ADDRESS_BLOCKED','IP']] as const) {
    const error = googleDiagnostic('google_places', { isAxiosError: true, response: { status, data: { error: {
      message: secret, status: 'PERMISSION_DENIED', details: [{ reason, metadata: { key: secret } }] } } } });
    assert(error instanceof GoogleDiagnostic);
    assert.equal(error.reason, reason);
    assert.equal(error.upstreamStatus, status);
    assert.match(error.message, new RegExp(label, 'i'));
    assert(!JSON.stringify(error).includes(secret));
  }
  const generic = googleDiagnostic('google_places', { isAxiosError: true, response: { status: 403,
    data: { error: { status: 'PERMISSION_DENIED', message: secret, details: [{ reason: secret }] } } } });
  assert(generic instanceof GoogleDiagnostic);
  assert.equal(generic.reason, 'PERMISSION_DENIED');
  assert.match(generic.message, /did not identify/);
  assert(!JSON.stringify(generic).includes(secret));
});

test('isolated generation probe validates the challenge and rejects static, malformed and fallback outputs', async t => {
  const prev = config.GEMINI_API_KEY;
  config.GEMINI_API_KEY = secret;
  try {
    let mode = 'valid';
    t.mock.method(axios, 'post', async (url: string, body: { contents: { parts: { text: string }[] }[] }, options: AxiosRequestConfig) => {
      assert(!url.includes(secret));
      assert.equal(options.headers?.['x-goog-api-key'], secret);
      if (mode === 'denied') throw { isAxiosError: true, response: { status: 403, data: { error: { message: secret } } } };
      const value = mode === 'valid' ? body.contents[0].parts[0].text.split(' ').at(-1) : 'static';
      return { data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ check: value }) }] } }] } };
    });
    assert.equal((await verifyGeneration()).httpStatus, 200);
    mode = 'invalid';
    await assert.rejects(verifyGeneration(), /invalid response/);
    mode = 'denied';
    await assert.rejects(verifyGeneration(), e => e instanceof GoogleDiagnostic && !e.message.includes(secret));
  } finally { config.GEMINI_API_KEY = prev; }
});

test('Places verifies the New search endpoint directly and Overpass needs a fresh bounded response', async t => {
  const old = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = secret;
  try {
    const request = t.mock.method(axios, 'post', async (url: string, body: { pageSize: number }, opts: AxiosRequestConfig) => {
      assert.equal(url, 'https://places.googleapis.com/v1/places:searchText');
      assert.equal(opts.headers?.['X-Goog-Api-Key'],secret);
      assert.equal(body.pageSize,1);
      return { data:{ places: [{ id:'place_fixture', displayName:{ text:'Isolated test' } }] } };
    });
    assert.equal(await new GooglePlacesProvider().verifyListing('Hyderabad','India'),'place_fixture');
    let samples = 0;
    request.mock.restore();
    t.mock.method(axios, 'post', async (_url: string, body: string) => {
      const query = new URLSearchParams(body).get('data')!;
      assert.match(query,/Hyderabad/); assert.match(query,/out center qt 3;/);
      return { data: { elements:[{ type:'area',id:1 },{ type:'node',id:++samples,tags:{name:'Isolated test'} }] } };
    });
    const provider = new OverpassProvider('https://overpass.example/api/interpreter',0);
    const filters = { city:'Hyderabad',country:'India',industry:'Restaurants',maxLeads:1 };
    await provider.search(filters);
    assert.equal(await provider.verifyCity(filters),'node/2');
  } finally { if (old === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = old; }
});

test('SerpApi summarizes usage, health and diagnostics across all 4 providers', async () => {
  const readiness = await getReadiness();
  assert.equal(readiness.providers.length, 4);
  const serp = readiness.providers.find(p => p.id === 'serpapi');
  assert(serp);
  assert.equal(serp.setting, 'SERPAPI_API_KEY');
  assert(serp.diagnostics);
  assert.equal(serp.diagnostics.requestUrl, 'https://serpapi.com/account.json');
});

test('test runner cannot persist a provider verification', { skip: !process.env.DISCOVERY_TEST_DATABASE_URL }, async () => {
  const { prisma, initDatabaseConnection } = await import('../db/prisma');
  assert.equal(process.env.DATABASE_URL,process.env.DISCOVERY_TEST_DATABASE_URL);
  assert(await initDatabaseConnection());
  const before = await prisma.providerVerification.count();
  await assert.rejects(verifyReadiness('gemini',{}), /cannot record live acceptance/);
  assert.equal(await prisma.providerVerification.count(),before);
  await prisma.$disconnect();
});
