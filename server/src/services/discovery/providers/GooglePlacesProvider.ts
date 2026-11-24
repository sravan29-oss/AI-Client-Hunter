import axios from 'axios';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
  ISearchProvider,
  DiscoveryFilter,
  SearchProviderResult,
  DiscoveredLead,
  ProviderStatus,
  ContactVerificationStatus,
} from '../types';
import { classifyProviderError, ProviderFailure, providerHttpFailure } from '../providerErrors';
import { completeProviderCheck } from '../providerStatus';
import { googleDiagnostic } from '../googleDiagnostic';
import { directoryRequest } from '../directoryUsage';
import { normalizeCountry, normalizedLabel } from '../../idealProfileTypes';

const legacySearchUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const currentSearchUrl = 'https://places.googleapis.com/v1/places:searchText';
const nearbySearchUrl = 'https://places.googleapis.com/v1/places:searchNearby';
const listingFieldMask = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.websiteUri',
  'places.internationalPhoneNumber', 'places.nationalPhoneNumber', 'places.types', 'places.addressComponents',
  'places.businessStatus', 'places.googleMapsUri',
].join(',');

const nearbyTypes: Record<string, string> = {
  restaurants: 'restaurant', 'retail stores': 'store', 'retail shops': 'store',
  hotels: 'hotel', healthcare: 'hospital', 'healthcare businesses': 'hospital',
  education: 'school', 'real estate': 'real_estate_agency', 'travel agencies': 'travel_agency',
};

export function canSearchGoogleNearby(filters: Pick<DiscoveryFilter, 'profileSnapshot' | 'industry'>) {
  const radius = filters.profileSnapshot?.location.radius;
  return Boolean(radius && radius.km <= 50 && Object.hasOwn(nearbyTypes, normalizedLabel(filters.industry)));
}

const currentSearchResponse = z.strictObject({
  places: z.array(z.object({
    id: z.string().min(1),
    displayName: z.object({ text: z.string() }).optional(),
    formattedAddress: z.string().optional(),
    addressComponents: z.array(z.object({ longText: z.string().optional(), shortText: z.string().optional(), types: z.array(z.string()).default([]) })).optional(),
    websiteUri: z.string().optional(),
    nationalPhoneNumber: z.string().optional(),
    internationalPhoneNumber: z.string().optional(),
    rating: z.number().optional(),
    userRatingCount: z.number().optional(),
    types: z.array(z.string()).optional(),
    businessStatus: z.string().optional(),
    googleMapsUri: z.string().optional(),
    location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  })).optional(),
  nextPageToken: z.string().optional(),
});

interface PlaceListing {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  city?: string;
  countryCode?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  website?: string;
  phone?: string;
  businessStatus?: string;
  mapsUrl?: string;
  coordinates?: { lat: number; lon: number };
}

export class GooglePlacesProvider implements ISearchProvider {
  readonly id = 'google_places';
  readonly name = 'Google Places API';
  readonly description = 'High-accuracy local and regional business intelligence powered by Google Places.';

  private lastHealthCheck?: ProviderStatus;
  private lastHealthCheckTime = 0;
  private useCurrentEndpoint = false;

  private get apiKey(): string | undefined {
    return process.env.GOOGLE_PLACES_API_KEY?.trim();
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 5);
  }

  getStatus(): ProviderStatus {
    const configured = this.isConfigured();
    if (configured && this.lastHealthCheck) return this.lastHealthCheck;
    const error = configured ? null : 'Set GOOGLE_PLACES_API_KEY in the backend environment.';
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      configured,
      requiresApiKey: true,
      configurationKind: 'api_key',
      connectionState: configured ? 'not_tested' : 'missing_configuration',
      envVarKey: 'GOOGLE_PLACES_API_KEY',
      statusMessage: error ?? 'Run a connection test to verify Google Places.',
      isHealthy: false,
      error,
    };
  }

  private async searchLegacy(query: string, key: string, timeout = 15000): Promise<PlaceListing[] | undefined> {
    if (this.useCurrentEndpoint) return undefined;
    return directoryRequest(this.id, async () => {
    const { data } = await axios.get(legacySearchUrl, {
      params: { query, key }, timeout, maxRedirects: 0,
    });
    if (data?.status === 'REQUEST_DENIED' && typeof data.error_message === 'string' && /\blegacy API\b/i.test(data.error_message)) {
      this.useCurrentEndpoint = true;
      return undefined;
    }
    switch (data?.status) {
      case 'ZERO_RESULTS': return [];
      case 'OK':
        if (Array.isArray(data.results)) return data.results;
        break;
      case 'REQUEST_DENIED': throw providerHttpFailure(this.id, 403);
      case 'OVER_QUERY_LIMIT':
      case 'OVER_DAILY_LIMIT': throw providerHttpFailure(this.id, 429);
      case 'INVALID_REQUEST': throw providerHttpFailure(this.id, 400);
      case 'UNKNOWN_ERROR': throw providerHttpFailure(this.id, 503);
    }
    throw new ProviderFailure(this.id, 'invalid_response');
    });
  }

  private async searchCurrentPage(key: string, url: string, request: object, fieldMask: string, attempts = 3) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await directoryRequest(this.id, async () => {
          const { data } = await axios.post(url, request, {
            headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fieldMask },
            validateStatus: status => status === 200,
            timeout: 8000, maxRedirects: 0, maxContentLength: 1024 * 1024,
          });
          const parsed = currentSearchResponse.safeParse(data);
          if (!parsed.success) throw new ProviderFailure(this.id, 'invalid_response');
          return parsed.data;
        });
      } catch (error) {
        const failure = googleDiagnostic(this.id, error);
        if (attempt + 1 >= attempts || !['upstream_error', 'unavailable', 'timeout'].includes(failure.kind)) throw failure;
        await delay(1000 * 2 ** attempt);
      }
    }
  }

  async verifyListing(city: string, country: string) {
    if (!this.apiKey) throw new ProviderFailure(this.id, 'missing_credentials');
    const page = await this.searchCurrentPage(this.apiKey, currentSearchUrl, {
      textQuery: 'Restaurants in ' + [city, country].join(', '), pageSize: 1,
    }, listingFieldMask, 1);
    const place = page.places?.find(item => item.id && item.displayName?.text.trim());
    if (!place) throw new ProviderFailure(this.id, 'invalid_response', 200, 'Places returned no named listing for this check.');
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(place.id) || place.id.includes(this.apiKey)) throw new ProviderFailure(this.id, 'invalid_response', 200);
    return place.id;
  }

  private async searchCurrent(query: string, key: string, limit: number, filters: DiscoveryFilter): Promise<PlaceListing[]> {
    const { websiteAvailability } = filters;
    const results: PlaceListing[] = [];
    const seen = new Set<string>();
    const pageSize = websiteAvailability && websiteAvailability !== 'any' ? 20 : Math.min(limit, 20);
    const radius = filters.profileSnapshot?.location.radius;
    if (radius && !canSearchGoogleNearby(filters)) {
      throw new ProviderFailure(this.id, 'invalid_input', undefined, 'Google Nearby Search requires a supported business category and a radius of at most 50 km.');
    }
    let pageToken: string | undefined;
    // Google Text Search returns at most 60 results across three pages.
    for (let page = 0; page < 3; page++) {
      const { places, nextPageToken } = radius
        ? await this.searchCurrentPage(key, nearbySearchUrl, {
            includedTypes: [nearbyTypes[normalizedLabel(filters.industry)]], maxResultCount: pageSize,
            locationRestriction: { circle: { center: { latitude: radius.latitude, longitude: radius.longitude }, radius: radius.km * 1000 } },
          }, `${listingFieldMask},places.location`)
        : await this.searchCurrentPage(key, currentSearchUrl, { textQuery: query, pageSize, pageToken }, `${listingFieldMask},nextPageToken`);
      for (const place of places ?? []) {
        if (!place.displayName?.text.trim() || seen.has(place.id) || place.businessStatus === 'CLOSED_PERMANENTLY') continue;
        if (websiteAvailability === 'has_website' && !place.websiteUri) continue;
        if (websiteAvailability === 'no_website' && place.websiteUri) continue;
        seen.add(place.id);
        results.push({
          place_id: place.id, name: place.displayName.text, formatted_address: place.formattedAddress,
          city: place.addressComponents?.find((part) => part.types.some((type) => type === 'locality' || type === 'postal_town'))?.longText,
          countryCode: place.addressComponents?.find((part) => part.types.includes('country'))?.shortText,
          types: place.types, businessStatus: place.businessStatus, mapsUrl: place.googleMapsUri,
          coordinates: place.location ? { lat: place.location.latitude, lon: place.location.longitude } : undefined,
          website: place.websiteUri, phone: place.nationalPhoneNumber || place.internationalPhoneNumber,
        });
        if (results.length >= limit) return results;
      }
      if (radius || !nextPageToken || nextPageToken === pageToken) break;
      pageToken = nextPageToken;
    }
    return results;
  }

  async checkHealth(forceRefresh = false): Promise<ProviderStatus> {
    const status = this.getStatus();
    if (!status.configured) return status;
    const now = Date.now();
    if (!forceRefresh && this.lastHealthCheck && (now - this.lastHealthCheckTime < 60000)) {
      return this.lastHealthCheck;
    }

    const probe = 'restaurant in London';
    const key = this.apiKey!;
    try {
      if (await this.searchLegacy(probe, key, 8000) === undefined) {
        await this.searchCurrentPage(key, currentSearchUrl, { textQuery: probe, pageSize: 1 }, 'places.id', 1);
      }
      this.lastHealthCheck = completeProviderCheck(status, now);
    } catch (cause) {
      const failure = classifyProviderError(this.id, cause);
      const error = failure.kind === 'authentication'
        ? this.useCurrentEndpoint
          ? failure.message
          : 'Google Places rejected the server API key. Check API access and key restrictions in Google Cloud.'
        : undefined;
      this.lastHealthCheck = completeProviderCheck(status, now, failure, error);
    }
    this.lastHealthCheckTime = Date.now();
    return this.lastHealthCheck;
  }

  async search(filters: DiscoveryFilter): Promise<SearchProviderResult> {
    if (!this.isConfigured()) {
      return {
        providerId: this.id,
        providerName: this.name,
        leads: [],
        errors: this.getStatus().statusMessage,
        totalFound: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const { country, city, industry, websiteAvailability } = filters;
    const maxLeads = Math.max(1, Math.min(50, filters.maxLeads || 10));
    const locationQuery = [city, country].filter(Boolean).join(', ');
    const query = `${industry} in ${locationQuery}`;
    const leads: DiscoveredLead[] = [];

    try {
      const key = this.apiKey!;
      const legacy = filters.profileSnapshot ? undefined : await this.searchLegacy(query, key);
      const places = legacy ?? await this.searchCurrent(query, key, maxLeads, filters);

      for (const place of places) {
        if (leads.length >= maxLeads) break;
        const businessName = typeof place?.name === 'string' ? place.name.trim() : '';
        if (!businessName) continue;

        let website = place.website || null;
        let phone = place.phone || null;

        if (legacy && place.place_id) {
          try {
            const detailsRes = await directoryRequest(this.id, () => axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
              params: {
                place_id: place.place_id,
                fields: 'website,formatted_phone_number,international_phone_number,opening_hours',
                key,
              },
              timeout: 10000,
              maxRedirects: 0,
            }));
            const details = detailsRes.data?.result || {};
            website = details.website || null;
            phone = details.formatted_phone_number || details.international_phone_number || null;
          } catch (error) {
            const failure = classifyProviderError(this.id, error);
            if (failure.kind === 'rate_limit') throw failure;
          }
        }

        if (websiteAvailability === 'has_website' && !website) continue;
        if (websiteAvailability === 'no_website' && website) continue;

        const contactStatus: ContactVerificationStatus = {
          websiteStatus: website ? 'verified' : 'unavailable',
          phoneStatus: phone ? 'verified' : 'unavailable',
          emailStatus: 'unavailable', // Google Places does not index business emails
        };

        leads.push({
          businessName,
          website,
          country: normalizeCountry(place.countryCode || '')?.country ?? country,
          city: place.city || city || null,
          industry,
          businessEmail: null,
          contactName: null,
          publicBusinessPhone: phone,
          source: `Google Places API (${city || country})`,
          providerId: this.id,
          providerName: this.name,
          discoveryDate: new Date().toISOString(),
          detectedProblems: [],
          suggestedServices: filters.servicesRequired?.length ? filters.servicesRequired : ['Business website', 'React Native mobile application'],
          opportunityScore: 0,
          businessDescription: null,
          contactStatus,
          listingEvidence: { address: place.formatted_address, city: place.city, countryCode: place.countryCode, categories: place.types,
            coordinates: place.coordinates, businessStatus: place.businessStatus, sourceReference: place.place_id, sourceUrl: place.mapsUrl },
          metadata: {
            placeId: place.place_id,
            rating: place.rating,
            userRatingsTotal: place.user_ratings_total,
            types: place.types,
          },
        });
      }

      return {
        providerId: this.id,
        providerName: this.name,
        leads,
        totalFound: leads.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw classifyProviderError(this.id, error);
    }
  }
}
