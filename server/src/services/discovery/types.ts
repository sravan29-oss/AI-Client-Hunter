import type { OsmObject } from '../../utils/osmObject';
import type { ProfileSnapshot } from '../idealProfileTypes';

export type DiscoveryIndustry =
  | 'Restaurants'
  | 'Retail stores'
  | 'Hotels'
  | 'Offices'
  | 'Healthcare businesses'
  | 'Real estate'
  | 'Education'
  | 'E-commerce'
  | 'Travel agencies'
  | 'Local service providers'
  | 'Startups'
  | 'Professional services';

export type BusinessSize =
  | 'Small (1-10)'
  | 'Medium (11-50)'
  | 'Growing (51-200)'
  | 'Enterprise (200+)'
  | 'Any';

export type WebsiteAvailability = 'has_website' | 'no_website' | 'any';

export interface DiscoveryFilter {
  country: string;
  city?: string;
  industry: string;
  businessSize?: BusinessSize | string;
  websiteAvailability?: WebsiteAvailability;
  servicesRequired?: string[];
  maxLeads: number;
  providerId?: string;
  domain?: string;
  businessName?: string;
  jobId?: string;
  osmTags?: Array<{ key: string; value: string }>;
  profileSnapshot?: ProfileSnapshot;
}

export interface ContactVerificationStatus {
  websiteStatus: 'verified' | 'unverified' | 'unavailable';
  phoneStatus: 'verified' | 'unverified' | 'unavailable';
  emailStatus: 'verified' | 'unverified' | 'unavailable';
}

export interface ListingEvidence {
  address?: string;
  city?: string;
  countryCode?: string;
  categories?: string[];
  businessType?: string;
  coordinates?: { lat: number; lon: number };
  mappedBoundary?: boolean;
  employeeCount?: number;
  budget?: { amount: number; currency: string };
  businessStatus?: string;
  sourceReference?: string;
  sourceUrl?: string;
  socialLinks?: Record<string, string>;
}

export interface DiscoveredLead {
  businessName: string;
  website?: string | null;
  country: string;
  city?: string | null;
  industry: string;
  businessEmail?: string | null;
  contactName?: string | null;
  publicBusinessPhone?: string | null;
  source: string;
  providerId: string;
  providerName: string;
  discoveryDate: string;
  detectedProblems: string[];
  suggestedServices: string[];
  opportunityScore: number;
  businessDescription?: string | null;
  notes?: string | null;
  isDuplicate?: boolean;
  duplicateReason?: string;
  contactStatus: ContactVerificationStatus;
  osmObject?: OsmObject;
  listingEvidence?: ListingEvidence;
  metadata?: Record<string, any>;
}

export interface SearchProviderResult {
  providerId: string;
  providerName: string;
  leads: DiscoveredLead[];
  errors?: string | null;
  totalFound: number;
  fallbackOccurred?: boolean;
  primaryProviderName?: string;
  fallbackReason?: string;
  filteredOut?: number;
  timestamp: string;
}

export type ProviderConnectionState = 'connected' | 'missing_configuration' | 'unavailable' | 'rate_limited' | 'not_tested' | 'ready';

export interface ProviderStatus {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  requiresApiKey: boolean;
  configurationKind: 'api_key' | 'endpoint' | 'none';
  purpose?: 'address_geocoding';
  connectionState: ProviderConnectionState;
  envVarKey?: string;
  statusMessage: string;
  isHealthy: boolean;
  lastChecked?: string;
  lastSuccessfulSearchAt?: string;
  latencyMs?: number;
  error?: string | null;
  enabled?: boolean;
  requestsToday?: number;
  dailyRequestLimit?: number;
  dailyRequestsRemaining?: number;
  lastSuccessfulRequestAt?: string;
  lastRequestError?: string;
}

export interface IProviderConnection {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  isConfigured(): boolean;
  getStatus(): ProviderStatus;
  checkHealth(forceRefresh?: boolean): Promise<ProviderStatus>;
}

export interface ISearchProvider extends IProviderConnection {
  search(filters: DiscoveryFilter): Promise<SearchProviderResult>;
}
