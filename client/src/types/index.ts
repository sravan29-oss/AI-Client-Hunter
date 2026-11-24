import type { EngagementPerformance } from './engagement';

export type Region = 'INDIA' | 'US' | 'UK' | 'EUROPE' | 'OTHER';
export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP';

export type LeadStatus =
  | 'New'
  | 'Qualified'
  | 'Reviewed'
  | 'Interested'
  | 'Not_Interested'
  | 'Rejected'
  | 'Archived'
  | 'Analysed'
  | 'Ready to Contact'
  | 'Ready_to_Contact'
  | 'Contacted'
  | 'Replied'
  | 'Meeting Scheduled'
  | 'Meeting_Scheduled'
  | 'Negotiation'
  | 'Won'
  | 'Lost';

export type PitchChannel = 'COLD_EMAIL' | 'LINKEDIN' | 'WHATSAPP' | 'UPWORK_PROPOSAL';
export type PitchStatus = 'DRAFT' | 'SENT' | 'REPLIED' | 'CONVERTED';

export type OutreachMessageType =
  | 'COLD_EMAIL'
  | 'WHATSAPP_MESSAGE'
  | 'LINKEDIN_CONNECT'
  | 'LINKEDIN_FOLLOWUP'
  | 'INSTAGRAM_DM'
  | 'FREELANCE_PROPOSAL'
  | 'PROJECT_INTRO'
  | 'FOLLOW_UP';

export type ServiceKey =
  | 'business_website'
  | 'ecommerce'
  | 'react_native'
  | 'admin_dashboard'
  | 'backend_api'
  | 'ai_integration';

export interface EvidenceFinding {
  title?: string;
  issue?: string;
  description?: string;
  recommendation?: string;
  evidence: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'opportunity';
}

export interface BusinessOpportunityFinding {
  title?: string;
  opportunity?: string;
  description?: string;
  rationale?: string;
  evidence?: string;
  estimatedImpact?: string;
  potentialValue?: string;
  recommendedService?: string;
}

export interface ServiceOfferRecommendation {
  service: string;
  rationale?: string;
  reason?: string;
  scopeOfWork?: string;
  evidence?: string;
  estimatedBudgetRange?: string;
}

export interface FirstContactSuggestion {
  recommendedChannel?: string;
  channel?: string;
  subjectLine?: string;
  openingHook: string;
  messageDraft?: string;
  fullMessage?: string;
  reasoning?: string;
}

export interface WebsiteEvidence {
  url: string;
  finalUrl: string;
  isHttps: boolean;
  hasSsl: boolean;
  hadHttpsRedirect: boolean;
  statusCode: number;
  loadTimeMs: number;
  htmlSizeBytes: number;
  htmlSizeKb: number;

  // Title & Meta
  pageTitle: string;
  pageTitleLength: number;
  pageTitleStatus: 'optimal' | 'too_short' | 'too_long' | 'missing';
  metaDescription: string;
  metaDescriptionLength: number;
  metaDescriptionStatus: 'optimal' | 'too_short' | 'too_long' | 'missing';
  canonicalUrl: string | null;
  openGraph: {
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  };
  hasTwitterCards: boolean;

  // Mobile Viewport
  hasViewport: boolean;
  viewportContent: string | null;
  hasDeviceWidth: boolean;
  hasInitialScale: boolean;
  isResponsiveReady: boolean;

  // Headings & Navigation
  h1Count: number;
  h1List: string[];
  h2Count: number;
  h2List: string[];
  h3Count: number;
  hasNavigation: boolean;
  navLinksCount: number;
  navItems: string[];
  emptyNavLinksCount: number;

  // Contact Options
  emailsFound: string[];
  phonesFound: string[];
  hasContactForm: boolean;
  hasWhatsApp: boolean;
  socialLinks: Record<string, string>;

  // Links & Page Structure
  totalLinksCount: number;
  internalLinksCount: number;
  externalLinksCount: number;
  emptyLinksCount: number;
  pageStructure: {
    hasHeader: boolean;
    hasMain: boolean;
    hasFooter: boolean;
    hasSection: boolean;
    hasArticle: boolean;
    hasAside: boolean;
  };

  // Accessibility & Performance Signs
  totalImagesCount: number;
  imagesMissingAltCount: number;
  imagesWithAltCount: number;
  hasHtmlLang: boolean;
  htmlLangValue: string | null;
  hasAriaAttributes: boolean;
  externalScriptsCount: number;
  inlineScriptsCount: number;
  stylesheetCount: number;
  hasFavicon: boolean;

  // Tech Detection & Body
  detectedTech: string[];
  bodySample: string;
}

export interface WebsiteAnalysisResult {
  overallScore: number;
  speedScore: number;
  mobileFriendly: boolean;
  mobileScore?: number;
  seoScore?: number;
  accessibilityScore?: number;
  websiteSummary: string;
  designImprovements: EvidenceFinding[];
  mobileExperienceIssues: EvidenceFinding[];
  seoIssues: EvidenceFinding[];
  missingFeatures: Array<{
    title?: string;
    feature?: string;
    description?: string;
    businessImpact?: string;
    evidence: string;
    severity?: 'critical' | 'high' | 'medium' | 'low' | 'opportunity';
  }>;
  businessOpportunities: BusinessOpportunityFinding[];
  servicesOffered: ServiceOfferRecommendation[];
  firstContactSuggestion?: FirstContactSuggestion;
  personalizedFirstContact?: FirstContactSuggestion;
  techStackDetected: string[];
  uiUxIssues: string[];
  missingCapabilities: string[];
  securityFindings: string[];
  pitchHooks: string[];
  summary: string;
}

export interface AuditReport {
  id: string;
  leadId?: string | null;
  websiteUrl: string;
  overallScore: number;
  mobileFriendly: boolean;
  speedScore: number;
  techStackDetected: string[];
  missingCapabilities: string[];
  securityFindings: string[];
  uiUxIssues: string[];
  pitchHooks: string[];
  summary: string;
  rawData?: {
    evidence?: WebsiteEvidence;
    analysis?: WebsiteAnalysisResult;
    loadTimeMs?: number;
    htmlSizeKb?: number;
  };
  evidence?: WebsiteEvidence;
  analysis?: WebsiteAnalysisResult;
  createdAt: string;
}

export interface FollowUpItem {
  delayDays: number;
  subject: string;
  body: string;
}

export interface QuoteService {
  serviceKey: string;
  tier: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
}

export interface ProposalSnapshot {
  currency: 'INR' | 'USD';
  totalMinor: number;
  estimatedWeeks: number;
  customer: { id: string; businessName: string; city: string | null; country: string | null; website: string | null };
  lines: Array<QuoteService & { packageId: string; name: string; amountMinor: number; turnaroundWeeks: number; deliverables: string[] }>;
}

export interface ScheduledFollowUp {
  id: string;
  leadId: string;
  pitchId: string | null;
  lead: { id: string; businessName: string };
  title: string;
  notes: string | null;
  dueAt: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  remindedAt: string | null;
  revision: number;
}

export interface Pitch {
  id: string;
  leadId?: string | null;
  campaignId?: string | null;
  lead?: {
    businessName?: string;
    companyName?: string;
    country?: string;
    region?: Region;
    website?: string | null;
  };
  channel: PitchChannel | string;
  messageType?: OutreachMessageType | string;
  targetService: string;
  targetRegion: Region | string;
  subject?: string;
  body: string;
  personalisedOpening?: string | null;
  observedOpportunity?: string | null;
  relevantService?: string | null;
  valueProposition?: string | null;
  callToAction?: string | null;
  professionalClosing?: string | null;
  followUpSequence?: FollowUpItem[];
  tone: string;
  status: PitchStatus;
  sentAt?: string | null;
  approvedAt?: string | null;
  proposal?: ProposalSnapshot | null;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  providerVerifications?: { finishedAt: string; origin?: 'acceptance' | 'production'; evidence: { model: string; inspectedAt: string; ranked: string[] } }[];
  aiStatus?: 'pending' | 'available' | 'temporarily_unavailable' | 'failed' | null;
  id: string;
  businessName: string;
  website?: string | null;
  country?: string | null;
  city?: string | null;
  industry: string;
  businessEmail?: string | null;
  contactName?: string | null;
  publicBusinessPhone?: string | null;
  source: string;
  discoveryDate?: string | null;
  osmObject?: OsmObject;
  profileMatch?: ProfileMatch | null;
  websiteAnalysisStatus?: 'ANALYZED' | 'FAILED' | 'NOT_LISTED' | null;
  qualificationStatus?: 'QUALIFIED' | null;
  discoveryEvidence?: {
    classification: 'High Priority' | 'Strong Prospect' | 'Potential Prospect' | 'Not Qualified';
    targetLocation: { city?: string | null; country: string };
    profileName?: string;
    fields: Record<string, { value: string; source: string }>;
    socialLinks: Array<{ platform: string; url: string; source: string }>;
    inspection: { status: string; detail?: string; httpStatus?: number | null; inspectedAt?: string };
    analysis: {
      businessSummary: string; websiteCondition: string; confidence: number; generatedBy: 'gemini' | 'evidence_fallback';
      opportunities: Array<{ id: string; opportunity: string; evidence: string; service: string; scope: string }>;
    };
  } | null;
  discoverySources?: Array<{ providerId: string; reference: string; sourceUrl?: string | null; firstDiscoveredAt: string; lastDiscoveredAt: string }>;
  activityHistory?: Array<{ id: string; description: string; createdAt: string }>;
  businessDescription?: string | null;
  detectedProblems: string[];
  suggestedServices: string[];
  opportunityScore: number;
  leadStatus: LeadStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  audits?: AuditReport[];
  pitches?: Pitch[];

  // Phase 9 extensions
  lastSeenAt?: string | null;
  qualificationScore?: number | null;
  qualificationReason?: string | null;
  qualificationEvidence?: string | null;
  suggestedProjectScope?: string | null;
  estimatedComplexity?: 'Low' | 'Medium' | 'High' | string | null;
  aiSummary?: string | null;

  // Compatibility aliases
  companyName?: string;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status?: LeadStatus;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedValue?: number;
  currency?: Currency;
  region?: Region;
  suggestedService?: string | null;
  services?: string[];
}

export interface ServicePackage {
  id: string;
  serviceKey: ServiceKey | string;
  name: string;
  description: string;
  tier: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  priceInr: number;
  priceUsd: number;
  turnaroundWeeks: number;
  deliverables: string[];
  popular?: boolean;
}

export interface ProspectItem {
  companyName: string;
  websiteUrl: string;
  city: string;
  country: string;
  industry: string;
  region: Region;
  estimatedValue: number;
  currency: Currency;
  services: string[];
  currentTechBottleneck: string;
  suggestedPitchAngle: string;
}

export interface BusinessProfile {
  displayName: string;
  professionalRole: string;
  portfolioUrl: string;
  services: string[];
  technologies: string[];
  defaultCurrency: Currency;
  revision: number;
}

export type ProjectClaimKind = 'description' | 'feature' | 'technology' | 'business_problem' | 'screenshot';

export interface ProjectClaim {
  kind: ProjectClaimKind;
  statement: string;
  evidence: string;
  evidenceUrl?: string;
  approved: boolean;
}

export interface PortfolioProjectInput {
  name: string;
  url: string;
  serviceCategories: string[];
  claims: ProjectClaim[];
  shareable: boolean;
}

export interface PortfolioProject extends PortfolioProjectInput {
  id: string;
  revision: number;
  archivedAt: string | null;
}

export interface BusinessKnowledge {
  profile: BusinessProfile;
  projects: PortfolioProject[];
  storage: 'database' | 'temporary';
}

export interface TargetLocation {
  country: string;
  countryCode?: string;
  city: string;
  radius: { latitude: number; longitude: number; km: number } | null;
  schedule: { mode: 'DAILY' | 'WEEKLY' | 'MANUAL'; time: string; timezone: string } | null;
}

export interface IdealProfileInput {
  name: string;
  targeting: {
    locations: TargetLocation[];
    industries: string[];
    categories: string[];
    companySizes: string[];
    services: string[];
    minProjectBudget: { amount: number; currency: Currency } | null;
    preferredBusinessTypes: string[];
    minLeadScore: number;
  };
}

export interface IdealClientProfile extends IdealProfileInput {
  id: string;
  active: boolean;
  revision: number;
}

export interface ProfileMatch {
  profileName: string;
  revision: number;
  score: number;
  service: string | null;
  unknown: string[];
  factors: Array<{ label: string; points: number; max: number; evidence: string }>;
}

export type ProviderConnectionState = 'connected' | 'missing_configuration' | 'unavailable' | 'rate_limited' | 'not_tested' | 'ready';

export type OsmObject = { type: 'node' | 'way' | 'relation'; id: number };

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
  isHealthy?: boolean;
  lastChecked?: string;
  lastSuccessfulSearchAt?: string;
  enabled?: boolean;
  requestsToday?: number;
  dailyRequestLimit?: number;
  dailyRequestsRemaining?: number;
  lastSuccessfulRequestAt?: string;
  lastRequestError?: string;
  latencyMs?: number;
  error?: string | null;
}

export interface ContactVerificationStatus {
  websiteStatus: 'verified' | 'unverified' | 'unavailable';
  phoneStatus: 'verified' | 'unverified' | 'unavailable';
  emailStatus: 'verified' | 'unverified' | 'unavailable';
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
  providerId?: string;
  providerName?: string;
  discoveryDate: string;
  detectedProblems: string[];
  suggestedServices: string[];
  opportunityScore: number;
  businessDescription?: string | null;
  notes?: string | null;
  isDuplicate?: boolean;
  duplicateReason?: string;
  contactStatus?: ContactVerificationStatus;
  osmObject?: OsmObject;
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
  timestamp?: string;
}

export interface DiscoveryFilter {
  country: string;
  city?: string;
  industry: string;
  businessSize?: string;
  websiteAvailability?: 'has_website' | 'no_website' | 'any';
  servicesRequired: string[];
  maxLeads: number;
  providerId?: string;
  domain?: string;
  businessName?: string;
  osmTags?: Array<{ key: string; value: string }>;
}

export interface DiscoveryHistoryItem {
  id: string;
  searchQuery: string;
  searchLocation: string;
  sourceUsed: string;
  leadsCount: number;
  errors?: string | null;
  filters?: any;
  results?: DiscoveredLead[];
  createdAt: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: {
      status: string;
      engine: string;
      actionNeeded: string | null;
    };
    geminiAi: {
      configured: boolean;
      model: string;
      actionNeeded: string | null;
    };
  };
  system: {
    rssMb: number;
    heapUsedMb: number;
  };
}

export interface ActivityLogItem {
  id: string;
  action: string;
  description: string;
  metadata?: any;
  createdAt: string;
}

export interface AnalyticsData {
  engagementPerformance?: EngagementPerformance;
  salesPerformance?: {
    won: number;
    lost: number;
    proposals: {
      drafts: number; sent: number; accepted: number;
      totals: Array<{ currency: 'INR' | 'USD'; quotedMinor: number; acceptedMinor: number }>;
    };
    followUps: { pending: number; due: number; completed: number; cancelled: number };
  };
  summary: {
    totalLeads: number;
    qualifiedLeads: number;
    newLeads: number;
    highPriorityLeads: number;
    contactedLeads: number;
    repliesReceived: number;
    meetingsBooked: number;
    dealsWon: number;
    totalValueInr: number;
    totalValueUsd: number;
    wonValueInr: number;
    wonValueUsd: number;
    winRatePercentage: number;
  };
  leadAcquisitionChart: Array<{ name: string; leads: number }>;
  leadConversionChart: Array<{ stage: string; count: number }>;
  regionDistribution: Array<{ name: string; count: number; region?: Region }>;
  serviceBreakdown: Array<{ service: string; count: number }>;
  recentLeads: Array<Pick<Lead, 'id' | 'businessName' | 'industry' | 'city' | 'country' | 'leadStatus' | 'opportunityScore' | 'createdAt'>>;
  topOpportunities: AnalyticsData['recentLeads'];
  recentActivity: ActivityLogItem[];
  outreachMetrics: {
    totalGenerated: number;
    sent: number;
    replied: number;
    converted: number;
    replyRatePercentage?: number;
  };
}

export interface NotificationItem {
  id: string;
  leadId?: string | null;
  lead?: {
    id: string;
    businessName: string;
    website?: string | null;
    opportunityScore: number;
    leadStatus: string;
  } | null;
  title: string;
  message: string;
  type: 'LEAD_QUALIFIED' | 'LEAD_DISCOVERED' | 'SEARCH_COMPLETED' | 'PROVIDER_ERROR' | 'SYSTEM' | string;
  read: boolean;
  metadata?: any;
  createdAt: string;
}

export interface SchedulerConfig {
  id?: string;
  enabled: boolean;
  scheduleMode: 'DAILY' | 'WEEKLY' | 'MANUAL';
  scheduledTime: string;
  timezone: string;
  targetCountries: string[];
  targetCities: string[];
  targetIndustries: string[];
  minOpportunityScore: number;
  maxLeadsPerRun: number;
  preferredProvider: string;
  notifyInApp: boolean;
  notifyEmail: boolean;
  notifyTelegram: boolean;
  notificationEmail?: string | null;
  telegramChatId?: string | null;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  nextRunAt?: string | null;
}

export interface SchedulerStatus {
  isRunning: boolean;
  jobStatus: 'QUEUED' | 'RUNNING' | null;
  enabled: boolean;
  scheduleMode: string;
  scheduledTime: string;
  timezone: string;
  preferredProvider: string;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  nextRunAt?: string | null;
  unreadNotifications: number;
  activeProfile?: { id: string; name: string; locations: Array<{ key: string; country: string; city: string; nextRunAt: string | null; timezone: string; mode: string }> } | null;
  currentRun?: AutoHunterLogItem | null;
  externalAlertsEnabled?: boolean;
}

export interface AutoHunterLogItem {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL' | string;
  triggerType: 'SCHEDULED' | 'MANUAL' | string;
  providerUsed: string;
  country: string;
  city?: string | null;
  industry: string;
  discoveredCount: number;
  qualifiedCount: number;
  duplicatesCount: number;
  websitesAuditedCount: number;
  errorDetails?: string | null;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  createdAt: string;
  profileSnapshot?: { profileName: string; scheduledFor?: string | null } | null;
  qualificationMetrics?: {
    providerId: string; enriched: number; rejected: number; inspectionFailures: number;
    directoryRequests: number; geminiRequests: number; providerError?: string;
    rejectionReasons: Array<{ businessName: string; reason: string; score?: number; websiteStatus: string; inspectionError?: string }>;
    qualifiedLeads: Array<{ id: string; businessName: string; score: number }>;
  } | null;
}

export interface DailyReportItem {
  timezone?: string | null;
  localDate?: string | null;
  id: string;
  reportDate: string;
  businessesDiscovered: number;
  qualifiedLeads: number;
  highOpportunityLeads: number;
  leadsByCountry?: Record<string, number>;
  leadsByIndustry?: Record<string, number>;
  websitesAnalyzed: number;
  duplicatesSkipped: number;
  failedSearches: number;
  summary?: string;
  createdAt: string;
}
