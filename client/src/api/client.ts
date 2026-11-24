import axios from 'axios';
import type { ProviderId, ReadinessDashboard } from '../types/providerReadiness';
import type { BusinessGrowthReport, GrowthSelection } from '../types/businessGrowth';
import type { MarketIntelligenceReport } from '../types/marketIntelligence';
import type { BusinessReport, BusinessReportHistory, BusinessReportInterpretationStatus, ReportKind } from '../types/businessReports';
import type { CampaignInput, CampaignPreview, ContactPolicy, ContactScope, ContactStatus, DraftEligibility,
  LeadEngagement, OutreachCampaign, ResponseKind } from '../types/engagement';
import type { QuoteService, ScheduledFollowUp } from '../types';
import type { BusinessKnowledge, BusinessProfile, IdealClientProfile, IdealProfileInput, PortfolioProject, PortfolioProjectInput } from '../types';
import {
  Lead,
  AuditReport,
  Pitch,
  ServicePackage,
  ProspectItem,
  AnalyticsData,
  HealthCheckResponse,
  Region,
  ProviderStatus,
  DiscoveryFilter,
  SearchProviderResult,
  DiscoveryHistoryItem,
  NotificationItem,
  SchedulerConfig,
  SchedulerStatus,
  AutoHunterLogItem,
  DailyReportItem,
} from '../types';

const envApiUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
  || (typeof process !== 'undefined' && process.env?.VITE_API_URL)
  || '';
const rawApiUrl = envApiUrl.trim().replace(/\/+$/, '');
const apiBase = rawApiUrl ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`) : '/api';

const api = axios.create({
  baseURL: apiBase,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});
const reportsPath = '/analytics/business-growth/reports';

export const sessionToken = {
  read: () => sessionStorage.getItem('api_token'),
  save: (token: string) => sessionStorage.setItem('api_token', token),
  clear: () => sessionStorage.removeItem('api_token'),
};

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly details?: unknown) {
    super(message);
  }
}

export interface NotificationDeliveryItem {
  id: string;
  leadId: string;
  businessName: string;
  channel: 'EMAIL' | 'TELEGRAM';
  status: 'PENDING' | 'SENDING' | 'RETRYING' | 'DELIVERED' | 'FAILED';
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

api.interceptors.request.use((config) => {
  const token = sessionToken.read();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorMsg =
      error.response?.data?.error?.message ||
      error.message ||
      'An unexpected error occurred while communicating with AI Client Hunter API.';
    return Promise.reject(new ApiError(errorMsg, error.response?.status, error.response?.data?.error?.details));
  }
);

export interface LeadsQueryParams {
  search?: string;
  country?: string;
  industry?: string;
  service?: string;
  status?: string;
  sortBy?: 'opportunityScore' | 'createdAt' | 'businessName';
  sortOrder?: 'asc' | 'desc';
}

export interface FilterOptions {
  countries: string[];
  industries: string[];
  services: string[];
  statuses: string[];
}

export interface CsvImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  imported: Lead[];
  skippedDuplicates: Array<{
    row: number;
    businessName: string;
    website?: string;
    reason: string;
    existingId?: string;
  }>;
  errors: Array<{ row: number; error: string }>;
}

export const apiClient = {
  getProviderReadiness: async (): Promise<ReadinessDashboard> => (await api.get('/provider-readiness')).data.data,
  verifyProvider: async (id: ProviderId, choice: { locationKey?: string; leadId?: string }): Promise<ReadinessDashboard> =>
    (await api.post('/provider-readiness/' + id + '/verify', id === 'gemini' ? { ...choice, requestId: crypto.randomUUID() } : choice, { timeout: 100000 })).data.data,
  checkSession: async (token?: string): Promise<void> => {
    await api.get('/session', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  },

  // Health
  getHealth: async (): Promise<HealthCheckResponse> => {
    const res = await api.get('/health');
    return res.data;
  },

  // Leads
  getLeads: async (params?: LeadsQueryParams): Promise<{ data: Lead[]; count: number; storageNotice?: string }> => {
    const res = await api.get('/leads', { params });
    return res.data;
  },

  getFilterOptions: async (): Promise<FilterOptions> => {
    const res = await api.get('/leads/filters/options');
    return res.data.data;
  },

  getLeadById: async (id: string): Promise<Lead> => {
    const res = await api.get(`/leads/${id}`);
    return res.data.data;
  },

  createLead: async (lead: Partial<Lead>): Promise<Lead> => {
    const res = await api.post('/leads', lead);
    return res.data.data;
  },

  batchCreateLeads: async (leads: any[]): Promise<{ count: number; data: Lead[] }> => {
    const res = await api.post('/leads/batch', { leads });
    return res.data;
  },

  updateLead: async (id: string, updates: Partial<Lead>): Promise<Lead> => {
    const res = await api.put(`/leads/${id}`, updates);
    return res.data.data;
  },

  deleteLead: async (id: string): Promise<void> => {
    await api.delete(`/leads/${id}`);
  },

  importCsv: async (csvText: string): Promise<CsvImportResult> => {
    const res = await api.post('/leads/import/csv', { csvText });
    return res.data;
  },

  exportLeadsCsv: async (): Promise<Blob> => {
    const res = await api.get('/leads/export/csv', { responseType: 'blob' });
    return res.data;
  },

  // Business profile and portfolio
  listIdealProfiles: async (): Promise<IdealClientProfile[]> => {
    const response = await api.get('/ideal-client-profiles');
    return response.data.data;
  },

  saveIdealProfile: async (input: IdealProfileInput, profile?: IdealClientProfile): Promise<IdealClientProfile> => {
    const response = profile
      ? await api.put(`/ideal-client-profiles/${profile.id}`, { ...input, revision: profile.revision })
      : await api.post('/ideal-client-profiles', input);
    return response.data.data;
  },

  duplicateIdealProfile: async (profile: IdealClientProfile): Promise<IdealClientProfile> => {
    const response = await api.post(`/ideal-client-profiles/${profile.id}/duplicate`, { revision: profile.revision, name: `Copy of ${profile.name}`.slice(0, 120) });
    return response.data.data;
  },

  activateIdealProfile: async (profile: IdealClientProfile, active: boolean): Promise<IdealClientProfile> => {
    const response = await api.patch(`/ideal-client-profiles/${profile.id}/activation`, { revision: profile.revision, active });
    return response.data.data;
  },

  getBusinessKnowledge: async (): Promise<BusinessKnowledge> => {
    const res = await api.get('/business-profile');
    return res.data.data;
  },

  saveBusinessProfile: async (profile: BusinessProfile): Promise<BusinessProfile> => {
    const res = await api.put('/business-profile', profile);
    return res.data.data;
  },

  createPortfolioProject: async (project: PortfolioProjectInput): Promise<PortfolioProject> => {
    const res = await api.post('/business-profile/projects', project);
    return res.data.data;
  },

  savePortfolioProject: async (id: string, revision: number, project: PortfolioProjectInput): Promise<PortfolioProject> => {
    const res = await api.put(`/business-profile/projects/${encodeURIComponent(id)}`, { ...project, revision });
    return res.data.data;
  },

  setPortfolioArchive: async (project: PortfolioProject, archived: boolean): Promise<PortfolioProject> => {
    const res = await api.patch(`/business-profile/projects/${encodeURIComponent(project.id)}/archive`, { archived, revision: project.revision });
    return res.data.data;
  },

  // Discovery
  getDiscoveryProviders: async (checkHealth = true, force = false): Promise<ProviderStatus[]> => {
    const res = await api.get('/discovery/providers', { params: { checkHealth, force } });
    return res.data.data;
  },

  checkProviderHealth: async (id: string): Promise<ProviderStatus> => {
    const res = await api.post(`/discovery/providers/${id}/health`);
    return res.data.data;
  },

  searchDiscovery: async (filters: DiscoveryFilter): Promise<SearchProviderResult> => {
    const res = await api.post('/discovery/search', filters, { timeout: 65000 });
    return res.data.data;
  },

  getDiscoveryHistory: async (): Promise<DiscoveryHistoryItem[]> => {
    const res = await api.get('/discovery/history');
    return res.data.data;
  },

  deleteDiscoveryHistory: async (id: string): Promise<void> => {
    await api.delete(`/discovery/history/${id}`);
  },

  getDiscoveryPresets: async (): Promise<{ india: any[]; international: any[] }> => {
    const res = await api.get('/discovery/presets');
    return res.data.data;
  },

  scanProspects: async (filters: {
    region: Region;
    industry: string;
    services: string[];
    city?: string;
  }): Promise<ProspectItem[]> => {
    const res = await api.post('/discovery/scan', filters);
    return res.data.data;
  },

  // Website Audit
  auditWebsite: async (data: {
    websiteUrl: string;
    companyName?: string;
    leadId?: string;
    targetServices?: string[];
  }): Promise<AuditReport> => {
    const res = await api.post('/audit', data);
    return res.data.data;
  },

  getAuditsForLead: async (leadId: string): Promise<AuditReport[]> => {
    const res = await api.get(`/audit/lead/${leadId}`);
    return res.data.data;
  },

  // Pitches & Outreach Generator
  generatePitch: async (data: {
    companyName: string;
    contactName?: string;
    websiteUrl?: string;
    industry?: string;
    city?: string;
    country?: string;
    targetService: string;
    targetRegion?: Region | string;
    channel?: string;
    messageType?: string;
    tone?: string;
    leadId?: string;
    pitchHooks?: string[];
    verifiedProblems?: string[];
    auditSummary?: string;
    freelancerName?: string;
  }): Promise<Pitch> => {
    const res = await api.post('/pitches/generate', data);
    return res.data.data;
  },

  generateOutreach: async (data: {
    campaignId?: string;
    companyName: string;
    contactName?: string;
    websiteUrl?: string;
    industry?: string;
    city?: string;
    country?: string;
    targetService: string;
    targetRegion?: Region | string;
    channel?: string;
    messageType?: string;
    tone?: string;
    leadId?: string;
    pitchHooks?: string[];
    verifiedProblems?: string[];
    auditSummary?: string;
    freelancerName?: string;
  }): Promise<Pitch> => {
    const res = await api.post('/pitches/generate', data);
    return res.data.data;
  },

  getPitches: async (params?: {
    leadId?: string;
    channel?: string;
    messageType?: string;
    status?: string;
  }): Promise<Pitch[]> => {
    const res = await api.get('/pitches', { params });
    return res.data.data;
  },

  updatePitch: async (id: string, updates: Partial<Pitch>): Promise<Pitch> => {
    const res = await api.put(`/pitches/${id}`, updates);
    return res.data.data;
  },

  markPitchSent: async (id: string, updatedAt: string, occurredAt: string): Promise<Pitch> => {
    const res = await api.post(`/pitches/${id}/mark-sent`, { updatedAt, occurredAt, confirmed: true });
    return res.data.data;
  },

  approvePitch: async (id: string, updatedAt: string): Promise<Pitch> => {
    const res = await api.post(`/pitches/${id}/approve`, { updatedAt });
    return res.data.data;
  },

  getPitch: async (id: string): Promise<Pitch> => (await api.get(`/pitches/${id}`)).data.data,
  getDraftEligibility: async (id: string): Promise<DraftEligibility> => (await api.get(`/pitches/${id}/eligibility`)).data.data,
  getCampaigns: async (): Promise<OutreachCampaign[]> => (await api.get('/engagement/campaigns')).data.data,
  createCampaign: async (input: CampaignInput): Promise<OutreachCampaign> =>
    (await api.post('/engagement/campaigns', input)).data.data,
  updateCampaign: async (id: string, input: CampaignInput & { revision: number; archived: boolean }): Promise<OutreachCampaign> =>
    (await api.put(`/engagement/campaigns/${id}`, input)).data.data,
  getCampaignSegment: async (id: string): Promise<CampaignPreview> => (await api.get(`/engagement/campaigns/${id}/segment`)).data.data,
  getLeadEngagement: async (id: string): Promise<LeadEngagement> => (await api.get(`/engagement/leads/${id}`)).data.data,
  updateContactPolicy: async (
    id: string, input: { scope: ContactScope; status: ContactStatus; evidence: string; version: string },
  ): Promise<ContactPolicy> => (await api.put(`/engagement/leads/${id}/policy`, input)).data.data,
  recordLeadResponse: async (
    id: string, input: { pitchId: string; kind: ResponseKind; summary: string; occurredAt: string },
  ): Promise<{ pitch: Pitch }> => (await api.post(`/engagement/leads/${id}/responses`, input)).data.data,

  saveProposal: async (data: { leadId: string; currency: 'INR' | 'USD'; services: QuoteService[] }): Promise<Pitch> => {
    const res = await api.post('/ratecards/proposals', data);
    return res.data.data;
  },

  getFollowUps: async (leadId?: string): Promise<ScheduledFollowUp[]> => {
    const res = await api.get('/follow-ups', { params: { leadId } });
    return res.data.data;
  },

  scheduleFollowUp: async (data: { leadId: string; pitchId?: string; title: string; notes?: string; dueAt: string }): Promise<ScheduledFollowUp> => {
    const res = await api.post('/follow-ups', data);
    return res.data.data;
  },

  updateFollowUp: async (
    id: string, data: { revision: number; dueAt?: string; status?: 'COMPLETED' | 'CANCELLED' },
  ): Promise<ScheduledFollowUp> => {
    const res = await api.patch(`/follow-ups/${id}`, data);
    return res.data.data;
  },

  deletePitch: async (id: string): Promise<void> => {
    await api.delete(`/pitches/${id}`);
  },

  // Rate Cards & Proposal Estimator
  getRatecards: async (): Promise<ServicePackage[]> => {
    const res = await api.get('/ratecards');
    return res.data.data;
  },

  estimateProposal: async (data: {
    region: Region;
    currency: string;
    services: Array<{ serviceKey: string; tier: string }>;
    addons?: Array<{ key: string; name: string; priceInr: number; priceUsd: number }>;
    clientName?: string;
  }) => {
    const res = await api.post('/ratecards/estimate', data);
    return res.data.data;
  },

  // Analytics
  getAnalytics: async (): Promise<AnalyticsData> => {
    const res = await api.get('/analytics', { params: { view: 'summary' } });
    return res.data.data;
  },

  getBusinessGrowth: async (selection: GrowthSelection, signal?: AbortSignal): Promise<BusinessGrowthReport> => {
    const res = await api.get('/analytics/business-growth', { params: selection, signal });
    return res.data.data;
  },

  getMarketIntelligence: async (selection: GrowthSelection, signal?: AbortSignal): Promise<MarketIntelligenceReport> => {
    const res = await api.get('/analytics/business-growth/intelligence', { params: selection, signal });
    return res.data.data;
  },

  getBusinessReportHistory: async (signal?: AbortSignal, after?: string): Promise<BusinessReportHistory> => {
    const res = await api.get(reportsPath, { signal, params: { after } });
    return res.data.data;
  },

  generateBusinessReport: async (kind: ReportKind, date?: string): Promise<BusinessReport> => {
    const res = await api.post(reportsPath, { kind, date });
    return res.data.data;
  },

  openBusinessReport: async (id: string): Promise<BusinessReport> => {
    const res = await api.get(`${reportsPath}/${encodeURIComponent(id)}`);
    return res.data.data;
  },

  interpretBusinessReport: async (id: string): Promise<{ report: BusinessReport; status: BusinessReportInterpretationStatus }> => {
    const res = await api.post(`${reportsPath}/${encodeURIComponent(id)}/insights`);
    return res.data.data;
  },

  exportBusinessReport: async (id: string): Promise<Blob> => {
    const res = await api.get(`${reportsPath}/${encodeURIComponent(id)}/export.csv`, { responseType: 'blob' });
    return res.data;
  },

  // Phase 9: Autonomous Search Scheduler & Automation Controls
  getAutomationStatus: async (): Promise<SchedulerStatus> => {
    const res = await api.get('/automation/status');
    return res.data.data;
  },

  getAutomationConfig: async (): Promise<SchedulerConfig> => {
    const res = await api.get('/automation/config');
    return res.data.data;
  },

  updateAutomationConfig: async (data: Partial<SchedulerConfig>): Promise<SchedulerConfig> => {
    const res = await api.put('/automation/config', data);
    return res.data.data;
  },

  runAutomationCycle: async (locationKey?: string): Promise<{ data: { id: string }; message: string }> => {
    const res = await api.post('/automation/run', locationKey ? { locationKey } : undefined);
    return res.data;
  },

  stopAutomationCycle: async (): Promise<{ stopped: boolean; message: string }> => {
    const res = await api.post('/automation/stop');
    return res.data;
  },

  getAutomationLogs: async (limit = 30): Promise<AutoHunterLogItem[]> => {
    const res = await api.get('/automation/logs', { params: { limit } });
    return res.data.data;
  },

  getDailyReports: async (limit = 30): Promise<DailyReportItem[]> => {
    const res = await api.get('/automation/reports', { params: { limit } });
    return res.data.data;
  },

  generateDailyReport: async (): Promise<DailyReportItem> => {
    const res = await api.post('/automation/reports/generate');
    return res.data.data;
  },

  exportDailyReportCsv: async (id: string): Promise<Blob> => {
    const res = await api.get(`/automation/reports/${id}/export`, {
      responseType: 'blob',
    });
    return res.data;
  },

  // Phase 9: In-App Notification Center
  getNotifications: async (
    limit = 50,
    offset = 0,
    unreadOnly = false
  ): Promise<{ items: NotificationItem[]; total: number }> => {
    const res = await api.get('/notifications', {
      params: { limit, offset, unreadOnly },
    });
    return { items: res.data.data, total: res.data.total };
  },

  getUnreadNotificationsCount: async (): Promise<number> => {
    const res = await api.get('/notifications/unread-count');
    return res.data.data.unreadCount;
  },

  getNotificationDeliveries: async (): Promise<NotificationDeliveryItem[]> => {
    const res = await api.get('/notifications/deliveries');
    return res.data.data;
  },

  markNotificationRead: async (id: string): Promise<NotificationItem> => {
    const res = await api.patch(`/notifications/${id}/read`);
    return res.data.data;
  },

  markAllNotificationsRead: async (): Promise<any> => {
    const res = await api.post('/notifications/mark-all-read');
    return res.data;
  },

  deleteNotification: async (id: string): Promise<void> => {
    await api.delete(`/notifications/${id}`);
  },
};
