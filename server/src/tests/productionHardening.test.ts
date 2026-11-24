import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import axios, { type AxiosRequestConfig } from 'axios';
import { safeFetchHtml, validatePublicUrl } from '../utils/ssrfProtection';
import { ManualInputProvider } from '../services/discovery/providers/ManualInputProvider';
import { DiscoveryService } from '../services/discovery/discoveryService';
import { NominatimProvider } from '../services/discovery/providers/NominatimProvider';
import { ProviderFailure } from '../services/discovery/providerErrors';
import { setDirectoryLimit } from '../services/discovery/directoryUsage';

setDirectoryLimit('overpass', 120);
import { CsvFormatError, escapeCsvCell, parseCsv } from '../utils/csv';
import { reportingWindow } from '../services/dailyReportService';
import { logger } from '../utils/logger';

const search = { country: 'India', city: 'Pune', industry: 'Restaurants', maxLeads: 1 };

describe('Guarded outbound requests', () => {
  it('pins the network lookup and retains standard TLS verification', async (t) => {
    const dnsLookup = t.mock.method(dns.promises, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
    const request = t.mock.method(axios, 'get', async (url: string, options: AxiosRequestConfig) => {
      assert.equal(url, 'https://website.example/');
      assert.equal(options.proxy, false);
      assert.equal(options.maxRedirects, 0);
      assert.equal(options.httpsAgent.options.rejectUnauthorized, true);
      assert.equal(options.httpsAgent.options.servername, undefined);
      const lookup = options.httpsAgent.options.lookup;
      const resolved = await new Promise((resolve, reject) => {
        lookup('website.example', { all: true }, (error: Error | null, addresses: unknown) => error ? reject(error) : resolve(addresses));
      });
      assert.deepEqual(resolved, [{ address: '93.184.216.34', family: 4 }]);
      assert.equal(dnsLookup.mock.callCount(), 1);
      return { status: 200, headers: {}, data: '<title>Fixture</title>' };
    });
    assert.equal((await safeFetchHtml('https://website.example')).statusCode, 200);
    assert.equal(request.mock.callCount(), 1);
  });

  it('blocks mixed DNS answers, local redirects and unvalidated robots requests', async (t) => {
    t.mock.method(dns.promises, 'lookup', async (host: string) => host === 'mixed.example'
      ? [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]
      : [{ address: '93.184.216.34', family: 4 }]);
    const request = t.mock.method(axios, 'get', async () => ({ status: 302, headers: { location: 'http://localhost/' }, data: '' }));
    await assert.rejects(validatePublicUrl('https://mixed.example'), /private|reserved/);
    await assert.rejects(safeFetchHtml('https://website.example'), /local|private|reserved/);
    assert.equal(request.mock.callCount(), 1);
    const manual = await new ManualInputProvider().search({ ...search, domain: 'http://localhost/' });
    assert.equal(manual.leads.length, 0);
    assert.ok(manual.errors);
    assert.equal(request.mock.callCount(), 1);
  });

  it('uses guarded redirects for robots and rejects website error pages', async (t) => {
    t.mock.method(dns.promises, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
    const request = t.mock.method(axios, 'get', async (url: string, options: AxiosRequestConfig) => {
      assert.ok(options.httpsAgent.options.lookup);
      if (url.endsWith('/robots.txt')) return { status: 302, headers: { location: '/policy' }, data: '' };
      if (url.endsWith('/policy')) return { status: 404, headers: {}, data: '' };
      return { status: 500, headers: {}, data: '<title>Upstream failure</title>' };
    });
    const result = await new ManualInputProvider().search({ ...search, domain: 'https://website.example/' });
    assert.equal(result.leads.length, 0);
    assert.deepEqual(request.mock.calls.map((call) => call.arguments[0]), [
      'https://website.example/robots.txt', 'https://website.example/policy', 'https://website.example/',
    ]);
    await assert.rejects(safeFetchHtml('https://website.example/policy'), /HTTP 404/);
    await assert.rejects(safeFetchHtml('https://website.example/'), /HTTP 500/);
  });
});

describe('Provider failure contract', () => {
  for (const [upstream, http, kind] of [
    [400, 502, 'request_rejected'], [401, 502, 'authentication'], [403, 502, 'authentication'],
    [429, 429, 'rate_limit'], [500, 502, 'upstream_error'], [503, 503, 'unavailable'],
  ] as const) {
    it(`classifies upstream HTTP ${upstream} and suppresses its response body`, async (t) => {
      t.mock.method(axios, 'get', async () => {
        throw Object.assign(new Error('upstream test payload'), {
          isAxiosError: true, response: { status: upstream, data: 'upstream test payload' },
        });
      });
      const provider = new NominatimProvider('https://directory.example');
      await assert.rejects(provider.geocode('1 Test Street', 1), (error: unknown) =>
        error instanceof ProviderFailure && error.statusCode === http && error.kind === kind &&
        error.upstreamStatus === upstream && !error.message.includes('test payload'));
    });
  }

  it('distinguishes timeout, invalid payload, and legitimately empty results', async (t) => {
    const provider = new NominatimProvider('https://directory.example');
    const request = t.mock.method(axios, 'get', async () => ({ data: [] }));
    assert.deepEqual(await provider.geocode('1 Test Street', 1), []);
    request.mock.mockImplementation(async () => ({ data: { invalid: true } }) as never);
    await assert.rejects(provider.geocode('1 Test Street', 1), (error: unknown) => error instanceof ProviderFailure && error.kind === 'invalid_response');
    request.mock.mockImplementation(async () => { throw Object.assign(new Error('timed out'), { isAxiosError: true, code: 'ECONNABORTED' }); });
    await assert.rejects(provider.geocode('1 Test Street', 1), (error: unknown) => error instanceof ProviderFailure && error.kind === 'timeout');
  });

  it('falls back only to configured directories and records a successful search', async () => {
    const service = new DiscoveryService();
    const adapter = (id: string, ready: boolean) => ({
      id, name: id, description: 'Test adapter',
      isConfigured: () => ready,
      getStatus: () => ({
        id, name: id, description: 'Test adapter', configured: ready, requiresApiKey: false,
        configurationKind: 'endpoint' as const,
        connectionState: ready ? 'not_tested' as const : 'missing_configuration' as const,
        statusMessage: '', isHealthy: false,
      }),
      checkHealth: async () => adapter(id, ready).getStatus(),
      search: async () => ({ providerId: id, providerName: id, leads: [], totalFound: 0, timestamp: new Date().toISOString() }),
    });
    service.registerProvider(adapter('overpass', false));
    service.registerProvider(adapter('google_places', false));
    service.registerProvider(adapter('serpapi', false));
    await assert.rejects(service.search(search), (error: unknown) => error instanceof ProviderFailure && error.kind === 'missing_credentials');
    service.registerProvider(adapter('serpapi', true));
    const result = await service.search(search);
    assert.equal(result.providerId, 'serpapi');
    assert.equal(result.fallbackOccurred, true);
    const statuses = await service.withLastSuccessfulSearch(service.getProviders());
    assert.ok(statuses.find((status) => status.id === 'serpapi')?.lastSuccessfulSearchAt);
  });
});

describe('CSV, time zones and log redaction', () => {
  it('preserves quoted line breaks and rejects malformed or empty CSV', () => {
    const [row] = parseCsv('Name,Notes\r\n"Fixture, LLC","First\r\nSecond ""quoted"""');
    assert.deepEqual(row, { row: 2, value: { Name: 'Fixture, LLC', Notes: 'First\r\nSecond "quoted"' } });
    assert.throws(() => parseCsv('Name,Notes\r\nFixture,"Unclosed'), CsvFormatError);
    assert.throws(() => parseCsv(''), CsvFormatError);
    assert.equal(escapeCsvCell('  =1+1'), '"\'  =1+1"');
    assert.equal(escapeCsvCell('comma, "quote"\nnewline'), '"comma, ""quote""\nnewline"');
  });

  it('reports midnight in the configured IANA zone across daylight-saving changes', () => {
    const spring = reportingWindow(new Date('2026-03-08T12:00Z'), 'America/New_York');
    const autumn = reportingWindow(new Date('2026-11-01T12:00Z'), 'America/New_York');
    const india = reportingWindow(new Date('2026-11-01T19:15Z'), 'Asia/Kolkata');
    assert.equal((+spring.end - +spring.start) / 3600000, 23);
    assert.equal((+autumn.end - +autumn.start) / 3600000, 25);
    assert.equal(india.localDate, '2026-11-02');
    assert.equal(india.start.toISOString(), '2026-11-01T18:30:00.000Z');
  });

  it('redacts authorization strings and discards raw upstream payloads', (t) => {
    const log = t.mock.method(console, 'warn', () => {});
    logger.warn('Authorization: Bearer fixture-auth-secret', { rawResponse: 'upstream-secret', code: 'ETIMEDOUT' });
    const line = String(log.mock.calls[0].arguments[0]);
    assert.match(line, /redacted/);
    assert.match(line, /ETIMEDOUT/);
    assert.doesNotMatch(line, /fixture-auth-secret|upstream-secret/);
  });
});
