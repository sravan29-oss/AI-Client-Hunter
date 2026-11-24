import assert from 'node:assert/strict';
import { test } from 'node:test';
import axios from 'axios';
import { SerpApiProvider } from '../services/discovery/providers/SerpApiProvider';

test('derives SerpApi status from authenticated account health and quota', async (context) => {
  const previous = process.env.SERPAPI_API_KEY;
  const fixtureKey = 'serpapi-fixture-key';
  context.after(() => {
    if (previous === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = previous;
  });
  const provider = new SerpApiProvider();
  const account = { account_id: 'fixture', account_status: 'Active', total_searches_left: 1, api_key: fixtureKey };
  let httpError: number | undefined;
  const request = context.mock.method(axios, 'get', async (_url: string) => {
    if (httpError) throw { isAxiosError: true, response: { status: httpError, data: { key: fixtureKey } } };
    return { data: account };
  });

  delete process.env.SERPAPI_API_KEY;
  const missing = await provider.checkHealth(true);
  assert.equal(missing.connectionState, 'missing_configuration');
  assert.equal(missing.envVarKey, 'SERPAPI_API_KEY');
  assert.equal(request.mock.callCount(), 0);
  process.env.SERPAPI_API_KEY = fixtureKey;
  assert.equal(provider.getStatus().connectionState, 'not_tested');
  const connected = await provider.checkHealth(true);
  assert.equal(connected.connectionState, 'connected');
  assert.equal(request.mock.calls[0].arguments[0], 'https://serpapi.com/account.json');
  assert.ok(!JSON.stringify(connected).includes(fixtureKey));
  account.total_searches_left = 0;
  assert.equal((await provider.checkHealth()).connectionState, 'connected');
  assert.equal((await provider.checkHealth(true)).connectionState, 'rate_limited');
  httpError = 429;
  assert.equal((await provider.checkHealth(true)).connectionState, 'rate_limited');
  httpError = 401;
  const denied = await provider.checkHealth(true);
  assert.equal(denied.connectionState, 'unavailable');
  assert.match(denied.error || '', /SerpApi rejected the server API key/);
  assert.ok(!JSON.stringify(denied).includes(fixtureKey));
});
