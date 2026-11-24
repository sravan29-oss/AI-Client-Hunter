import axios from 'axios';
import { directoryRequest } from '../directoryUsage';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { config } from '../../../config';
import { osmObjectSchema } from '../../../utils/osmObject';
import { classifyProviderError, ProviderFailure } from '../providerErrors';
import { completeProviderCheck } from '../providerStatus';
import type { IProviderConnection, ProviderStatus } from '../types';
import { resolveOsmEndpoint } from './osmEndpoint';

const addressResponse = z.array(z.object({
  display_name: z.string().min(1), lat: z.string().min(1), lon: z.string().min(1),
  address: z.record(z.string(), z.string()).optional(), osm_type: z.string().optional(), osm_id: z.number().optional(),
}));

export class NominatimProvider implements IProviderConnection {
  readonly id = 'nominatim';
  readonly name = 'OpenStreetMap Nominatim';
  readonly description = 'Looks up individual addresses through an authorized Nominatim endpoint.';
  private readonly connection: ReturnType<typeof resolveOsmEndpoint>;
  private lastCheck?: ProviderStatus;
  private nextRequestAt = 0;

  constructor(endpoint = config.OSM_NOMINATIM_URL) {
    this.connection = resolveOsmEndpoint(endpoint, 'OSM_NOMINATIM_URL', 'Nominatim');
  }

  isConfigured() { return Boolean(this.connection.endpoint); }

  getStatus(): ProviderStatus {
    if (this.lastCheck) return this.lastCheck;
    const configured = this.isConfigured();
    return {
      id: this.id, name: this.name, description: this.description, configured, requiresApiKey: false,
      configurationKind: 'endpoint', purpose: 'address_geocoding', envVarKey: 'OSM_NOMINATIM_URL',
      connectionState: configured ? 'not_tested' : 'missing_configuration', isHealthy: false,
      statusMessage: this.connection.error ?? 'Run a connection test to verify the address lookup endpoint.', error: this.connection.error ?? null,
    };
  }

  private async get(resource: 'status.php' | 'search', params: Record<string, string | number>) {
    if (!this.connection.endpoint) throw new ProviderFailure(this.id, 'missing_credentials', undefined, this.connection.error);
    const now = Date.now();
    const slot = Math.max(now, this.nextRequestAt);
    if (slot - now > 3000) throw new ProviderFailure(this.id, 'rate_limit');
    this.nextRequestAt = slot + 1000;
    if (slot > now) await delay(slot - now);
    const { data } = await directoryRequest(this.id, () => axios.get(`${this.connection.endpoint}/${resource}`, {
      params, headers: { 'User-Agent': 'AIClientHunter/1.0' }, timeout: 8000, maxRedirects: 0, maxContentLength: 256 * 1024,
    }));
    return data;
  }

  async checkHealth(force = false): Promise<ProviderStatus> {
    const base = this.getStatus();
    if (!base.configured) return base;
    const now = Date.now();
    if (!force && this.lastCheck?.lastChecked && now - Date.parse(this.lastCheck.lastChecked) < 60000) return this.lastCheck;
    try {
      const data = await this.get('status.php', { format: 'json' });
      if (data?.status !== 0) throw new ProviderFailure(this.id, 'invalid_response', undefined, 'The endpoint did not return a healthy Nominatim status.');
      this.lastCheck = completeProviderCheck(base, now);
    } catch (error) {
      this.lastCheck = completeProviderCheck(base, now, classifyProviderError(this.id, error));
    }
    return this.lastCheck;
  }

  async geocode(address: string, limit: number) {
    try {
      const response = await this.get('search', { q: address, limit, format: 'jsonv2', addressdetails: 1 });
      const result = addressResponse.safeParse(response);
      if (!result.success) throw new ProviderFailure(this.id, 'invalid_response');
      const retrievedAt = new Date().toISOString();
      return result.data.slice(0, limit).flatMap((entry) => {
        const lat = Number(entry.lat), lon = Number(entry.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
        const object = osmObjectSchema.safeParse({ type: entry.osm_type, id: entry.osm_id });
        return [{ address: entry.display_name, coordinates: { lat, lon }, addressTags: entry.address ?? {},
          osmObject: object.success ? object.data : undefined, source: '© OpenStreetMap contributors', retrievedAt }];
      });
    } catch (error) {
      throw classifyProviderError(this.id, error);
    }
  }
}
