export type ProviderId = 'gemini' | 'google_places' | 'serpapi' | 'overpass';

export interface VerificationRecord {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  message: string;
  reason: string | null;
  httpStatus: number | null;
  locationKey: string | null;
  leadId: string | null;
  evidence: {
    object?: string;
    city?: string;
    country?: string;
    model?: string;
    placeId?: string;
    latencyMs?: number | null;
    lastChecked?: string;
    plan?: string;
    searchesRemaining?: number;
  } | null;
}

export interface ProviderUsageInfo {
  requestsToday: number;
  dailyLimit: number;
  remaining: number;
}

export interface ProviderDiagnostics {
  lastError?: string | null;
  httpStatus?: number | null;
  requestUrl?: string | null;
  suggestedFix?: string | null;
  latencyMs?: number | null;
}

export interface ProviderSummary {
  id: ProviderId;
  setting: string;
  configured: boolean;
  enabled: boolean;
  issue: string | null;
  state: string;
  passed: boolean;
  latest: VerificationRecord | null;
  lastSuccessAt: string | null;
  history: VerificationRecord[];
  grounded?: boolean;
  latencyMs?: number | null;
  usage?: ProviderUsageInfo;
  diagnostics?: ProviderDiagnostics;
}

export interface ReadinessDashboard {
  acceptance: 'passed' | 'withheld';
  googleRevocationConfirmed?: boolean;
  databaseAvailable: boolean;
  providers: ProviderSummary[];
  locations: { key: string; city: string; country: string }[];
  leads: { id: string; businessName: string }[];
}
