import axios from 'axios';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { config } from '../../../config';
import { osmObjectSchema } from '../../../utils/osmObject';
import { classifyProviderError, ProviderFailure } from '../providerErrors';
import { completeProviderCheck } from '../providerStatus';
import type { DiscoveredLead, DiscoveryFilter, ISearchProvider, ProviderStatus, SearchProviderResult } from '../types';
import { resolveOsmEndpoint } from './osmEndpoint';
import { makeOverpassQuery, overpassId } from './overpassQuery';
import { directoryRequest } from '../directoryUsage';

const attribution = '© OpenStreetMap contributors';
const cacheDurationMs = 15 * 60 * 1000;
const responseSchema = z.object({ elements: z.array(z.unknown()), remark: z.string().optional() });
const coordinateSchema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const elementSchema = osmObjectSchema.extend({ tags: z.record(z.string(), z.string()), center: z.unknown().optional(), lat: z.unknown().optional(), lon: z.unknown().optional() });
const areaSchema = z.object({ type: z.literal('area'), id: z.number() });
const countSchema = z.object({ type: z.literal('count'), tags: z.object({ total: z.string().regex(/^\d+$/) }) });

const addressKeys = ['full', 'housenumber', 'street', 'unit', 'suburb', 'city', 'town', 'village', 'place', 'state', 'postcode', 'country'];
const emailAddress = z.email();

function firstTag(tags: Record<string, string>, keys: string[], validate: (value: string) => string | null = (value) => value) {
  for (const key of keys) {
    for (const tag of (tags[key] ?? '').split(';')) {
      const candidate = tag.trim();
      if (candidate) {
        const valid = validate(candidate);
        if (valid) return valid;
      }
    }
  }
  return null;
}

function asWebsite(value: string) {
  try {
    const url = new URL(/^[a-z][\w+.-]*:/i.test(value) ? value : 'https://' + value);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.hostname.includes('.')) return url.toString();
  } catch { /* An invalid source tag is not a usable website. */ }
  return null;
}

function retryAfterMs(value: unknown, now: number) {
  if (typeof value !== 'string' && typeof value !== 'number') return 60000;
  const text = String(value).trim();
  const wait = /^\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text) - now;
  return Number.isFinite(wait) ? Math.max(1000, wait) : 60000;
}

export class OverpassProvider implements ISearchProvider {
  readonly id = overpassId;
  readonly name = 'OpenStreetMap Overpass';
  readonly description = 'Finds mapped businesses and public contact tags in a city using an authorized Overpass endpoint.';

  private readonly connection: ReturnType<typeof resolveOsmEndpoint>;
  private readonly cache = new Map<string, { expires: number; result: SearchProviderResult }>();
  private readonly running = new Map<string, Promise<SearchProviderResult>>();
  private tail = Promise.resolve();
  private pending = 0;
  private nextRequestAt = 0;
  private blockedUntil = 0;
  private lastHealth?: ProviderStatus;

  constructor(endpoint = config.OSM_OVERPASS_URL, private readonly minIntervalMs = config.OSM_OVERPASS_MIN_INTERVAL_MS) {
    this.connection = resolveOsmEndpoint(endpoint, 'OSM_OVERPASS_URL', 'Overpass', true);
  }

  isConfigured() { return Boolean(this.connection.endpoint); }

  getStatus(): ProviderStatus {
    if (this.lastHealth) return this.lastHealth;
    const configured = this.isConfigured();
    return {
      id: this.id, name: this.name, description: this.description, configured, requiresApiKey: false,
      configurationKind: 'endpoint', envVarKey: 'OSM_OVERPASS_URL',
      connectionState: configured ? 'not_tested' : 'missing_configuration', isHealthy: false,
      statusMessage: this.connection.error ?? 'Run a connection test to verify the Overpass interpreter.',
      error: this.connection.error ?? null,
    };
  }

  private rateLimitError() {
    return new ProviderFailure(this.id, 'rate_limit', 429, 'Overpass is limiting requests. Try again after the server cooldown.', Math.max(0, this.blockedUntil - Date.now()));
  }

  private async request(query: string, probe = false) {
    if (!this.connection.endpoint) throw new ProviderFailure(this.id, 'missing_credentials', undefined, this.connection.error);
    if (this.pending >= 3 || this.blockedUntil > Date.now()) throw this.rateLimitError();

    const endpoint = this.connection.endpoint;
    const signal = AbortSignal.timeout(probe ? 22000 : 45000);
    this.pending++;
    const task = this.tail.then(async () => {
      for (let attempt = 0; ; attempt++) {
        if (this.blockedUntil > Date.now()) throw this.rateLimitError();
        try {
          signal.throwIfAborted();
          const wait = this.nextRequestAt - Date.now();
          if (wait > 0) await delay(wait, undefined, { signal });
          this.nextRequestAt = Date.now() + this.minIntervalMs;
          return await directoryRequest(this.id, async () => {
          const { data } = await axios.post(endpoint, new URLSearchParams({ data: query }).toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AIClientHunter/1.0' },
            validateStatus: status => status === 200,
            signal, timeout: probe ? 8000 : 25000, maxRedirects: 0, maxContentLength: 2 * 1024 * 1024,
          });
          const response = responseSchema.safeParse(data);
          if (!response.success) throw new ProviderFailure(this.id, 'invalid_response');
          if (response.data.remark) {
            const kind = /timed out|timeout|out of memory/i.test(response.data.remark) ? 'timeout' : 'upstream_error';
            throw new ProviderFailure(this.id, kind);
          }
          return response.data.elements;
          });
        } catch (error) {
          if (signal.aborted) throw new ProviderFailure(this.id, 'timeout');
          const failure = classifyProviderError(this.id, error);
          if (failure.kind === 'rate_limit') {
            const now = Date.now();
            const header = axios.isAxiosError(error) ? error.response?.headers?.['retry-after'] : undefined;
            this.blockedUntil = now + Math.max(this.minIntervalMs, failure.retryAfterMs ?? retryAfterMs(header, now));
            throw this.rateLimitError();
          }
          if (probe || attempt > 0 || !failure.retryable || failure.kind === 'timeout') {
            if (failure.retryable) this.nextRequestAt = Math.max(this.nextRequestAt, Date.now() + Math.max(this.minIntervalMs, 15000));
            throw failure;
          }
          this.nextRequestAt = Math.max(this.nextRequestAt, Date.now() + 1000);
        }
      }
    });
    this.tail = task.then(() => undefined, () => undefined);
    try { return await task; } finally { this.pending--; }
  }

  async checkHealth(force = false): Promise<ProviderStatus> {
    const base = this.getStatus();
    if (!base.configured) return base;
    const now = Date.now();
    if (!force && this.lastHealth?.lastChecked && now - Date.parse(this.lastHealth.lastChecked) < 60000) return this.lastHealth;
    try {
      const elements = await this.request('[out:json][timeout:5]; node(id:1); out count;', true);
      if (!elements.some((item) => countSchema.safeParse(item).success)) throw new ProviderFailure(this.id, 'invalid_response');
      this.lastHealth = completeProviderCheck(base, now);
    } catch (error) {
      this.lastHealth = completeProviderCheck(base, now, classifyProviderError(this.id, error));
    }
    return this.lastHealth;
  }

  async search(filters: DiscoveryFilter): Promise<SearchProviderResult> {
    const selection = makeOverpassQuery(filters);
    const key = JSON.stringify([selection.query, selection.limit, selection.city, selection.country, filters.industry, filters.websiteAvailability, filters.servicesRequired ?? []]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return structuredClone(cached.result);
    if (cached) this.cache.delete(key);
    let task = this.running.get(key);
    if (!task) {
      task = this.fetchListings(filters, selection).then((result) => {
        this.cache.set(key, { expires: Date.now() + cacheDurationMs, result });
        if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
        return result;
      }).finally(() => this.running.delete(key));
      this.running.set(key, task);
    }
    return structuredClone(await task);
  }

  async verifyCity(filters: DiscoveryFilter) {
    const bounded = { ...filters, industry: 'Restaurants', maxLeads: 1 };
    const result = await this.fetchListings(bounded, makeOverpassQuery(bounded), true);
    const object = result.leads[0]?.osmObject;
    if (!object) throw new ProviderFailure(this.id, 'invalid_response', 200, 'The query returned no named business in the selected boundary.');
    return object.type + '/' + object.id;
  }

  private async fetchListings(filters: DiscoveryFilter, selection: ReturnType<typeof makeOverpassQuery>, probe = false): Promise<SearchProviderResult> {
    const elements = await this.request(selection.query, probe);
    if (!elements.some((element) => areaSchema.safeParse(element).success)) {
      throw new ProviderFailure(this.id, 'invalid_input', undefined, 'No mapped administrative boundary was found for this city and country. Try the official city name or an ISO country code.');
    }

    const timestamp = new Date().toISOString();
    const leads: DiscoveredLead[] = [];
    const seen = new Set<string>();
    for (const entry of elements) {
      const parsed = elementSchema.safeParse(entry);
      if (!parsed.success) continue;
      const { type, id, tags, center, lat, lon } = parsed.data;
      const businessName = tags.name?.trim();
      const objectKey = `${type}/${id}`;
      if (!businessName || businessName.length < 2 || seen.has(objectKey)) continue;
      const website = firstTag(tags, ['website', 'contact:website', 'url', 'contact:url'], asWebsite);
      if (filters.websiteAvailability === 'has_website' && !website) continue;
      if (filters.websiteAvailability === 'no_website' && website) continue;
      const email = firstTag(tags, ['contact:email', 'email'], (value) => emailAddress.safeParse(value).success ? value : null);
      const phone = firstTag(tags, ['contact:phone', 'phone', 'contact:mobile']);
      const coordinates = coordinateSchema.safeParse(type === 'node' ? { lat, lon } : center);
      const address = Object.fromEntries(addressKeys.flatMap((key) => tags[`addr:${key}`]?.trim() ? [[key, tags[`addr:${key}`].trim()]] : []));
      const street = [address.housenumber, address.street].filter(Boolean).join(' ');
      const formattedAddress = address.full || [street, address.city || address.town || address.village || address.place, address.postcode, address.country].filter(Boolean).join(', ');
      seen.add(objectKey);
      leads.push({
        businessName, website, businessEmail: email, publicBusinessPhone: phone, contactName: null,
        country: selection.country, city: address.city || address.town || address.village || selection.city, industry: filters.industry,
        source: attribution, providerId: this.id, providerName: this.name, discoveryDate: timestamp,
        businessDescription: formattedAddress || null, detectedProblems: [], opportunityScore: 0,
        suggestedServices: filters.servicesRequired?.length ? filters.servicesRequired : ['Business website'],
        contactStatus: { websiteStatus: website ? 'unverified' : 'unavailable', phoneStatus: phone ? 'unverified' : 'unavailable', emailStatus: email ? 'unverified' : 'unavailable' },
        osmObject: { type, id },
        listingEvidence: {
          mappedBoundary: true, address: formattedAddress || undefined, city: address.city || address.town || address.village,
          categories: ['shop', 'amenity', 'office', 'tourism', 'healthcare', 'craft', 'education', 'leisure'].flatMap((key) => tags[key] ? [tags[key]] : []),
          businessType: tags.business || tags.org_type,
          employeeCount: /^\d{1,7}$/.test(tags.employees ?? '') ? Number(tags.employees) : undefined,
          sourceReference: objectKey,
          sourceUrl: `https://www.openstreetmap.org/${type}/${id}`,
          coordinates: coordinates.success ? coordinates.data : undefined,
        },
        metadata: { coordinates: coordinates.success ? coordinates.data : null, address, objectUrl: `https://www.openstreetmap.org/${type}/${id}`, attribution },
      });
      if (leads.length >= selection.limit) break;
    }
    return { providerId: this.id, providerName: this.name, leads, totalFound: leads.length, timestamp };
  }
}
