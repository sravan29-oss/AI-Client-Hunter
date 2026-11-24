import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { NominatimProvider } from '../services/discovery/providers/NominatimProvider';
import { ProviderFailure } from '../services/discovery/providerErrors';

describe('Nominatim address lookup', () => {
  it('requires a configured endpoint and never calls the public Nominatim host', async (t) => {
    const request = t.mock.method(axios, 'get', async () => { throw new Error('Unexpected request'); });
    for (const endpoint of ['', 'not-a-url', 'https://directory.example?token=fixture', 'https://nominatim.openstreetmap.org', 'https://nominatim.openstreetmap.org.']) {
      const provider = new NominatimProvider(endpoint);
      const status = await provider.checkHealth();
      assert.equal(status.configured, false);
      assert.equal(status.configurationKind, 'endpoint');
      assert.equal(status.connectionState, 'missing_configuration');
      assert.match(status.error || '', /OSM_NOMINATIM_URL/);
      assert.ok(!JSON.stringify(status).includes('token=fixture'));
      assert.equal(status.purpose, 'address_geocoding');
      await assert.rejects(provider.geocode('1 Test Street', 1), (error) => error instanceof ProviderFailure && error.kind === 'missing_credentials');
    }
    assert.equal(request.mock.callCount(), 0);
  });

  it('connects through the configured status endpoint only when it confirms health', async (t) => {
    let statusCode = 1;
    const request = t.mock.method(axios, 'get', async (_url: string) => ({ status: 200, data: { status: statusCode } }));
    const provider = new NominatimProvider('https://directory.example/nominatim/');
    assert.equal(provider.getStatus().connectionState, 'not_tested');
    const unavailable = await provider.checkHealth();
    assert.equal(unavailable.connectionState, 'unavailable');
    assert.equal(request.mock.calls[0].arguments[0], 'https://directory.example/nominatim/status.php');
    statusCode = 0;
    assert.equal((await provider.checkHealth(true)).connectionState, 'connected');
  });

  it('uses the configured endpoint for an individual address lookup', async (t) => {
    const request = t.mock.method(axios, 'get', async (_url: string) => ({
      status: 200,
      data: [
        { display_name: '1 Test Street, Pune', lat: '18.52', lon: '73.85', address: { road: 'Test Street' }, osm_type: 'way', osm_id: 90 },
      ],
    }));
    const provider = new NominatimProvider('https://directory.example/nominatim');
    assert.equal(provider.getStatus().isHealthy, false);
    const result = await provider.geocode('1 Test Street, Pune', 1);
    assert.equal(request.mock.calls[0].arguments[0], 'https://directory.example/nominatim/search');
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].coordinates, { lat: 18.52, lon: 73.85 });
    assert.deepEqual(result[0].osmObject, { type: 'way', id: 90 });
    assert.equal('search' in provider, false);
  });
});
