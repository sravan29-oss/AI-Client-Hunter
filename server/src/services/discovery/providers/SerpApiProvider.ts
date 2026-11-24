import axios from 'axios';
import { directoryRequest } from '../directoryUsage';
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

export class SerpApiProvider implements ISearchProvider {
  readonly id = 'serpapi';
  readonly name = 'SerpApi Search Engine';
  readonly description = 'Structured search intelligence through SerpApi Google Local and Search endpoints.';

  private lastHealthCheck?: ProviderStatus;
  private lastHealthCheckTime = 0;

  private get apiKey(): string | undefined {
    return process.env.SERPAPI_API_KEY?.trim();
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 5);
  }

  getStatus(): ProviderStatus {
    const configured = this.isConfigured();
    if (configured && this.lastHealthCheck) return this.lastHealthCheck;
    const error = configured ? null : 'Set SERPAPI_API_KEY in the backend environment.';
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      configured,
      requiresApiKey: true,
      configurationKind: 'api_key',
      connectionState: configured ? 'not_tested' : 'missing_configuration',
      envVarKey: 'SERPAPI_API_KEY',
      statusMessage: error ?? 'Run a connection test to verify SerpApi.',
      isHealthy: false,
      error,
    };
  }

  async checkHealth(forceRefresh = false): Promise<ProviderStatus> {
    const status = this.getStatus();
    if (!status.configured) return status;
    const now = Date.now();
    if (!forceRefresh && this.lastHealthCheck && (now - this.lastHealthCheckTime < 60000)) {
      return this.lastHealthCheck;
    }

    try {
      const { data } = await directoryRequest(this.id, () => axios.get('https://serpapi.com/account.json', {
        params: { api_key: this.apiKey },
        timeout: 8000,
        maxRedirects: 0,
        maxContentLength: 64 * 1024,
      }));
      if (data?.error) throw this.responseFailure(String(data.error));
      if (!data || (!data.account_id && !data.account_email && typeof data.total_searches_left !== 'number')) {
        throw new ProviderFailure(this.id, 'invalid_response');
      }
      if (typeof data.account_status === 'string' && data.account_status.toLowerCase() !== 'active') {
        this.lastHealthCheck = completeProviderCheck(status, now, new ProviderFailure(this.id, 'authentication'), 'SerpApi reports that this account is inactive.');
      } else if (typeof data.total_searches_left === 'number' && data.total_searches_left <= 0) {
        this.lastHealthCheck = completeProviderCheck(status, now, new ProviderFailure(this.id, 'rate_limit'), 'The SerpApi account has no searches remaining.');
      } else if (typeof data.this_hour_searches === 'number' && typeof data.account_rate_limit_per_hour === 'number'
        && data.account_rate_limit_per_hour > 0 && data.this_hour_searches >= data.account_rate_limit_per_hour) {
        this.lastHealthCheck = completeProviderCheck(status, now, new ProviderFailure(this.id, 'rate_limit'), 'The SerpApi account has reached its hourly search limit.');
      } else {
        this.lastHealthCheck = completeProviderCheck(status, now);
      }
    } catch (cause) {
      const failure = classifyProviderError(this.id, cause);
      const error = failure.kind === 'authentication' ? 'SerpApi rejected the server API key. Check the key and account status in SerpApi.' : undefined;
      this.lastHealthCheck = completeProviderCheck(status, now, failure, error);
    }
    this.lastHealthCheckTime = Date.now();
    return this.lastHealthCheck;
  }

  private responseFailure(message: string): ProviderFailure {
    if (/quota|rate limit|run out/i.test(message)) return providerHttpFailure(this.id, 429);
    if (/key|unauthorized|forbidden/i.test(message)) return providerHttpFailure(this.id, 401);
    return new ProviderFailure(this.id, 'request_rejected');
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

    const { country, city, industry, maxLeads = 10, websiteAvailability } = filters;
    const locationQuery = [city, country].filter(Boolean).join(', ');
    const query = `${industry} in ${locationQuery}`;
    const leads: DiscoveredLead[] = [];

    try {
      const response = await directoryRequest(this.id, async () => {
        const response = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google_maps',
          q: query,
          api_key: this.apiKey,
        },
        timeout: 15000,
        maxRedirects: 0,
        });

        if (response.data?.error) throw this.responseFailure(String(response.data.error));
        if (!Array.isArray(response.data?.local_results) && response.data?.search_metadata?.status !== 'Success') {
          throw new ProviderFailure(this.id, 'invalid_response');
        }
        return response;
      });
      const localResults = response.data?.local_results;
      const results = Array.isArray(localResults) ? localResults : [];

      for (const item of results) {
        if (leads.length >= maxLeads) break;

        const businessName = typeof item?.title === 'string' ? item.title.trim() : '';
        if (!businessName) continue;
        const website = item.website || null;
        const phone = item.phone || null;

        if (websiteAvailability === 'has_website' && !website) continue;
        if (websiteAvailability === 'no_website' && website) continue;

        const contactStatus: ContactVerificationStatus = {
          websiteStatus: website ? 'verified' : 'unavailable',
          phoneStatus: phone ? 'verified' : 'unavailable',
          emailStatus: 'unavailable',
        };

        leads.push({
          businessName,
          website,
          country,
          city: city || null,
          industry,
          businessEmail: null,
          contactName: null,
          publicBusinessPhone: phone,
          source: `SerpApi Local (${city || country})`,
          providerId: this.id,
          providerName: this.name,
          discoveryDate: new Date().toISOString(),
          detectedProblems: [],
          suggestedServices: filters.servicesRequired?.length ? filters.servicesRequired : ['Business website'],
          opportunityScore: 0,
          businessDescription: typeof item.description === 'string' ? item.description : null,
          notes: `SerpApi data: ${item.rating || 'No'} stars (${item.reviews || 0} reviews).`,
          contactStatus,
          listingEvidence: {
            address: typeof item.address === 'string' ? item.address : undefined,
            sourceReference: typeof item.place_id === 'string' ? item.place_id : typeof item.data_id === 'string' ? item.data_id : undefined,
            categories: [item.type, ...(Array.isArray(item.types) ? item.types : [])].filter((type): type is string => typeof type === 'string'),
          },
          metadata: {
            rating: item.rating,
            reviews: item.reviews,
            placeId: item.place_id,
            dataId: item.data_id,
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
