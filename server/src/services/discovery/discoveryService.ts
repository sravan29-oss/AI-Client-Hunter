import {
  ISearchProvider,
  DiscoveryFilter,
  SearchProviderResult,
  ProviderStatus,
} from './types';
import { OverpassProvider } from './providers/OverpassProvider';
import { NominatimProvider } from './providers/NominatimProvider';
import { canSearchGoogleNearby, GooglePlacesProvider } from './providers/GooglePlacesProvider';
import { SerpApiProvider } from './providers/SerpApiProvider';
import { ManualInputProvider } from './providers/ManualInputProvider';
import { prisma, isDatabaseConnected, memoryStore } from '../../db/prisma';
import { randomUUID } from 'node:crypto';
import { findLeadByIdentity } from '../../db/leadIdentity';
import { classifyProviderError, ProviderFailure } from './providerErrors';
import { completeProviderCheck } from './providerStatus';
import { BadRequestError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { matchesProfileFilters } from './profileMatching';
import { directoryEnabled, directoryUsage } from './directoryUsage';

export class DiscoveryService {
  private readonly providerCooldowns = new Map<string, number>();
  private searchHealth = new Map<string, Pick<ProviderStatus, 'connectionState' | 'isHealthy' | 'error' | 'statusMessage'> & { lastChecked: string }>();
  private providers: Map<string, ISearchProvider> = new Map();
  private readonly nominatim = new NominatimProvider();

  constructor() {
    this.registerProvider(new OverpassProvider());
    this.registerProvider(new GooglePlacesProvider());
    this.registerProvider(new SerpApiProvider());
    this.registerProvider(new ManualInputProvider());
  }

  registerProvider(provider: ISearchProvider) {
    this.providers.set(provider.id, provider);
  }

  getProviders(): ProviderStatus[] {
    return [...Array.from(this.providers.values(), (provider) => this.withLatestSearchStatus(provider.getStatus())), this.nominatim.getStatus()];
  }

  private withLatestSearchStatus(status: ProviderStatus): ProviderStatus {
    const search = this.searchHealth.get(status.id);
    if (!status.configured || status.configurationKind === 'none' || !search || (status.lastChecked && search.lastChecked <= status.lastChecked)) {
      return status;
    }
    return { ...status, ...search, latencyMs: undefined };
  }

  async checkAllProvidersHealth(forceRefresh = false): Promise<ProviderStatus[]> {
    return Promise.all([...this.providers.keys(), this.nominatim.id].map((id) => this.checkProviderHealth(id, forceRefresh)));
  }

  async checkProviderHealth(id: string, forceRefresh = true): Promise<ProviderStatus> {
    const provider = id === this.nominatim.id ? this.nominatim : this.getProvider(id);
    if (!provider) {
      throw new BadRequestError(`Unknown provider "${id}"`);
    }
    const startedAt = Date.now();
    try {
      const status = await provider.checkHealth(forceRefresh);
      return forceRefresh ? status : this.withLatestSearchStatus(status);
    } catch (error) {
      const status = provider.getStatus();
      if (!status.configured) return status;
      return completeProviderCheck(status, startedAt, classifyProviderError(id, error));
    }
  }

  getProvider(id: string): ISearchProvider | undefined {
    return this.providers.get(id === 'openstreetmap' ? 'overpass' : id);
  }

  geocodeAddress(address: string, limit: number) {
    return this.nominatim.geocode(address, limit);
  }

  private getFallbackProvider(attempted: Set<string>, filters: DiscoveryFilter): ISearchProvider | undefined {
    const eligible = [...this.providers.values()].filter((provider) => provider.id !== 'manual_input'
      && !attempted.has(provider.id) && (provider.id !== 'overpass' || filters.city?.trim()) && provider.isConfigured()
      && directoryEnabled(provider.id)
      && (!filters.profileSnapshot?.location.radius || provider.id === 'overpass' || (provider.id === 'google_places' && canSearchGoogleNearby(filters)))
      && (this.providerCooldowns.get(provider.id) ?? 0) <= Date.now());
    return eligible.find((provider) => this.withLatestSearchStatus(provider.getStatus()).connectionState === 'connected') ?? eligible[0];
  }

  async withLastSuccessfulSearch(statuses: ProviderStatus[]): Promise<ProviderStatus[]> {
    return Promise.all(statuses.map(async (status) => {
      const last = isDatabaseConnected
        ? await prisma.discoverySearch.findFirst({
            where: { AND: [
              { filters: { path: ['effectiveProviderId'], equals: status.id } },
              { filters: { path: ['succeeded'], equals: true } },
            ] },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          })
        : memoryStore.discoverySearches.find((search) => search.filters?.effectiveProviderId === status.id && search.filters?.succeeded);
      const usage = await directoryUsage(status.id);
      const disabled = usage && !usage.enabled;
      return { ...status, ...usage, ...(disabled ? { isHealthy: false as const, connectionState: 'not_tested' as const,
        statusMessage: 'Disabled by the backend daily request limit.', error: null } : {}),
        lastSuccessfulSearchAt: last ? new Date(last.createdAt).toISOString() : undefined };
    }));
  }

  async search(filters: DiscoveryFilter): Promise<SearchProviderResult> {
    const primary = this.getProvider(filters.providerId || 'overpass');
    if (!primary) throw new BadRequestError('Unknown search provider.');
    if (filters.osmTags?.length && primary.id !== 'overpass') throw new BadRequestError('OSM tags are only supported by Overpass.');
    try {
      return await this.runProvider(primary, filters);
    } catch (error) {
      if (!(error instanceof ProviderFailure) || primary.id === 'manual_input' || filters.osmTags?.length) throw error;
      const attempted = new Set([primary.id]);
      let failure = error;
      for (let fallback = this.getFallbackProvider(attempted, filters); fallback; fallback = this.getFallbackProvider(attempted, filters)) {
        attempted.add(fallback.id);
        try { return await this.runProvider(fallback, filters, { primary: primary.name, reason: error.message }); }
        catch (cause) {
          if (!(cause instanceof ProviderFailure)) throw cause;
          failure = cause;
        }
      }
      throw failure;
    }
  }

  private async runProvider(
    provider: ISearchProvider,
    filters: DiscoveryFilter,
    fallback?: { primary: string; reason: string },
  ): Promise<SearchProviderResult> {
    const cooldown = (this.providerCooldowns.get(provider.id) ?? 0) - Date.now();

    let result: SearchProviderResult;
    try {
      if (!directoryEnabled(provider.id)) throw new ProviderFailure(provider.id, 'invalid_input', undefined, 'Search provider is disabled.');
      if (!provider.isConfigured()) throw new ProviderFailure(provider.id, 'missing_credentials', undefined, provider.getStatus().error ?? undefined);
      if (cooldown > 0) throw new ProviderFailure(provider.id, 'rate_limit', 429, 'Search provider is in a rate-limit cooldown.', cooldown);
      result = await provider.search(filters);
      if (!result || !Array.isArray(result.leads)) throw new ProviderFailure(provider.id, 'invalid_response');
      if (result.errors) {
        throw new ProviderFailure(provider.id, provider.id === 'manual_input' ? 'invalid_input' : 'upstream_error');
      }
    } catch (error) {
      const failure = classifyProviderError(provider.id, error);
      if (failure.kind === 'rate_limit' && cooldown <= 0) this.providerCooldowns.set(provider.id, Date.now() + Math.max(failure.retryAfterMs ?? 0, 60000));
      this.searchHealth.set(provider.id, {
      connectionState: failure.kind === 'missing_credentials' ? 'missing_configuration' : failure.kind === 'rate_limit' ? 'rate_limited' : 'unavailable',
        isHealthy: false, lastChecked: new Date().toISOString(), statusMessage: failure.message, error: failure.message,
      });
      await this.recordSearch(provider, filters, [], failure.message);
      throw failure;
    }

    const matched = filters.profileSnapshot
      ? result.leads.filter((lead) => matchesProfileFilters(lead, filters.profileSnapshot!, filters.industry))
      : result.leads;
    const filteredOut = result.leads.length - matched.length;
    const leads = await Promise.all(matched.map(async (lead) => {
      const duplicate = await findLeadByIdentity(lead);
      return {
        ...lead,
        source: fallback ? `${lead.source} (Fallback from ${fallback.primary})` : lead.source,
        isDuplicate: Boolean(duplicate),
        duplicateReason: duplicate ? 'An existing lead owns this business identity.' : undefined,
      };
    }));
    this.searchHealth.set(provider.id, {
      connectionState: 'connected',
      isHealthy: true, lastChecked: new Date().toISOString(), statusMessage: 'Search completed successfully.', error: null,
    });
    await this.recordSearch(provider, filters, leads, undefined, filteredOut);
    return {
      ...result, leads, totalFound: leads.length, filteredOut, timestamp: new Date().toISOString(),
      fallbackOccurred: Boolean(fallback), primaryProviderName: fallback?.primary, fallbackReason: fallback?.reason,
    };
  }

  private async recordSearch(provider: ISearchProvider, filters: DiscoveryFilter, leads: SearchProviderResult['leads'], error?: string, filteredOut = 0) {
    const data = {
      searchQuery: filters.industry,
      searchLocation: [filters.city, filters.country].filter(Boolean).join(', '),
      sourceUsed: provider.name,
      leadsCount: leads.length,
      errors: error ?? null,
      filters: JSON.parse(JSON.stringify({ ...filters, effectiveProviderId: provider.id, succeeded: !error, filteredOut })),
      results: JSON.parse(JSON.stringify(leads)),
    };
    try {
      if (isDatabaseConnected) {
        await prisma.discoverySearch.create({ data });
        if (!error) await prisma.activityLog.create({
          data: { action: 'DISCOVERY_SEARCH', description: 'Directory search completed.', metadata: { provider: provider.id, leadsCount: leads.length } },
        });
      } else {
        memoryStore.discoverySearches.unshift({ id: randomUUID(), ...data, createdAt: new Date() });
      }
    } catch {
      logger.error('Failed to record directory search.');
    }
  }

  async getHistory(): Promise<any[]> {
    if (isDatabaseConnected) {
      return prisma.discoverySearch.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
    }
    return memoryStore.discoverySearches;
  }

  async deleteHistory(id: string): Promise<boolean> {
    if (isDatabaseConnected) {
      await prisma.discoverySearch.delete({ where: { id } });
      return true;
    }
    const idx = memoryStore.discoverySearches.findIndex((s) => s.id === id);
    if (idx !== -1) {
      memoryStore.discoverySearches.splice(idx, 1);
      return true;
    }
    return false;
  }
}

export const discoveryService = new DiscoveryService();
