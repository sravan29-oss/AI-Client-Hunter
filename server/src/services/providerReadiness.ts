import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type ProviderVerification } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config';
import { prisma, isDatabaseConnected } from '../db/prisma';
import { AppError, BadRequestError, ConflictError } from '../utils/errors';
import { getActiveIdealProfile, snapshotProfile } from './idealClientProfiles';
import { locationKey } from './idealProfileTypes';
import { discoveryService } from './discovery/discoveryService';
import { GooglePlacesProvider } from './discovery/providers/GooglePlacesProvider';
import { OverpassProvider } from './discovery/providers/OverpassProvider';
import { SerpApiProvider } from './discovery/providers/SerpApiProvider';
import { directoryEnabled, directoryUsage } from './discovery/directoryUsage';
import { ProviderFailure, classifyProviderError } from './discovery/providerErrors';
import { GoogleDiagnostic } from './discovery/googleDiagnostic';
import { inspectListedWebsite } from './discovery/businessEnrichment';
import { measuredOpportunities } from './discovery/opportunityAnalysis';
import { generateGeminiJson, rankGeminiEvidence } from './geminiTransport';
import { hasGeminiDispatch, lockGeminiDispatch } from './geminiRankingQueue';
export { groundedRanking } from './geminiTransport';

export const providers = ['gemini', 'google_places', 'serpapi', 'overpass'] as const;
export type ReadinessProvider = typeof providers[number];
type Choice = { locationKey?: string; leadId?: string; requestId?: string };
type Configuration = { configured: boolean; enabled: boolean; configHash: string; issue: string | null };
const envNames = {
  gemini: 'GEMINI_API_KEY',
  google_places: 'GOOGLE_PLACES_API_KEY',
  serpapi: 'SERPAPI_API_KEY',
  overpass: 'OSM_OVERPASS_URL',
} as const;

const defaultUrls: Record<ReadinessProvider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/' + config.GEMINI_MODEL + ':generateContent',
  google_places: 'https://places.googleapis.com/v1/places:searchText',
  serpapi: 'https://serpapi.com/account.json',
  overpass: 'Backend-configured Overpass interpreter',
};

const eligibleLead: Prisma.LeadWhereInput = {
  websiteAnalysisStatus: 'ANALYZED',
  website: { not: null },
  discoverySources: { some: { providerId: { in: ['serpapi', 'google_places', 'overpass'] } } },
};

function configuration(id: ReadinessProvider): Configuration {
  const value = config[envNames[id]].trim();
  const overpass = id === 'overpass' ? discoveryService.getProvider(id)?.getStatus() : undefined;
  const enabled = id === 'gemini' || directoryEnabled(id);
  return {
    configured: Boolean(value),
    enabled,
    configHash: createHash('sha256').update(JSON.stringify([id, config.NODE_ENV, value, id === 'gemini' ? config.GEMINI_MODEL : null])).digest('hex'),
    issue: !value ? 'Set ' + envNames[id] + ' on the backend.'
      : overpass && !overpass.configured ? overpass.error ?? 'Invalid backend Overpass endpoint.'
      : !enabled ? 'The backend daily request limit disables this provider.'
      : null,
  };
}

const exposed = {
  id: true,
  startedAt: true,
  finishedAt: true,
  status: true,
  message: true,
  reason: true,
  httpStatus: true,
  evidence: true,
  locationKey: true,
  leadId: true,
} satisfies Prisma.ProviderVerificationSelect;

type PublicCheck = Pick<ProviderVerification, keyof typeof exposed>;
const leaseMs = 120_000;

function getSuggestedFix(id: ReadinessProvider, latest: PublicCheck | null, cfg: Configuration): string | null {
  if (!cfg.configured) {
    if (id === 'gemini') return 'Set GEMINI_API_KEY in the backend .env file to enable Gemini AI inferences.';
    if (id === 'google_places') return 'Set GOOGLE_PLACES_API_KEY in the backend .env file.';
    if (id === 'serpapi') return 'Set SERPAPI_API_KEY in the backend .env file.';
    if (id === 'overpass') return 'Set OSM_OVERPASS_URL in the backend .env file to an authorized Overpass interpreter endpoint.';
  }
  if (!cfg.enabled) {
    return 'The backend daily request limit for this provider has been set to 0. Increase the limit in .env to enable.';
  }
  if (id === 'google_places') {
    if (latest?.httpStatus === 403 || latest?.reason === 'PERMISSION_DENIED' || latest?.reason === 'ACCESS_DENIED') {
      return 'In the project that owns the backend key, confirm active billing, allow Places API (New), and check whether the server’s public egress IP is allowed.';
    }
  }
  if (id === 'overpass') {
    if (latest?.status === 'target_changed') {
      return 'The active targeting profile changed. Run a fresh query for a configured city in the active profile.';
    }
    if (latest?.httpStatus === 429 || latest?.reason === 'rate_limit') {
      return 'Overpass server cooldown active. Respect the server retry delay or wait 30 seconds before re-testing.';
    }
    if (latest?.status === 'failed' || latest?.status === 'unavailable') {
      return 'The Overpass endpoint returned an error or timed out. Verify your network or configure a fast alternative Overpass mirror in OSM_OVERPASS_URL.';
    }
  }
  if (id === 'serpapi') {
    if (latest?.httpStatus === 401 || latest?.reason === 'authentication') {
      return 'SerpApi rejected the API key. Verify the key at https://serpapi.com/manage-api-key.';
    }
    if (latest?.httpStatus === 429 || latest?.reason === 'rate_limit') {
      return 'SerpApi searches limit reached or account inactive. Check your balance at serpapi.com/dashboard.';
    }
  }
  if (id === 'gemini') {
    if (latest?.httpStatus === 403 || latest?.httpStatus === 401) {
      return 'Gemini API key rejected or unauthorized. Check your Google AI Studio API key at https://aistudio.google.com/.';
    }
  }
  return null;
}

export function summarizeProvider(
  id: ReadinessProvider,
  cfg: Configuration,
  latest: PublicCheck | null,
  lastSuccess: Date | null,
  grounded: boolean,
  cities: string[],
  now = Date.now(),
  usage?: { requestsToday: number; dailyLimit: number; remaining: number } | null,
  diagnostics?: { lastError?: string | null; httpStatus?: number | null; requestUrl?: string | null; suggestedFix?: string | null; latencyMs?: number | null } | null
) {
  let state = latest?.status ?? 'untested';
  if (!cfg.configured) state = 'missing_configuration';
  else if (cfg.issue) state = 'blocked';
  else if (state === 'running' && latest && now - latest.startedAt.getTime() >= leaseMs) state = 'interrupted';
  else if (state === 'verified' && id === 'overpass' && !cities.includes(latest?.locationKey ?? '')) state = 'target_changed';
  const passed = state === 'verified' && (id !== 'gemini' || grounded);
  const latencyMs = latest?.finishedAt ? Math.max(0, latest.finishedAt.getTime() - latest.startedAt.getTime()) : null;
  const requestUrl = defaultUrls[id];
  const suggestedFix = getSuggestedFix(id, latest, cfg);

  return {
    id,
    setting: envNames[id],
    configured: cfg.configured,
    enabled: cfg.enabled,
    issue: cfg.issue,
    state,
    passed,
    latest,
    lastSuccessAt: lastSuccess,
    grounded: id === 'gemini' ? grounded : undefined,
    latencyMs,
    usage: usage ?? undefined,
    diagnostics: diagnostics ?? {
      lastError: latest?.reason || latest?.message || null,
      httpStatus: latest?.httpStatus ?? null,
      requestUrl,
      suggestedFix,
      latencyMs,
    },
  };
}

export async function getReadiness() {
  const profile = await getActiveIdealProfile();
  const locations = (profile?.targeting.locations ?? []).filter(l => l.city).map(l => ({ key: locationKey(l), city: l.city, country: l.country }));
  const keys = locations.map(l => l.key);
  const checks = await Promise.all(providers.map(async id => {
    const cfg = configuration(id);
    const dirUsage = await directoryUsage(id);
    const usage = dirUsage ? {
      requestsToday: dirUsage.requestsToday,
      dailyLimit: dirUsage.dailyRequestLimit,
      remaining: dirUsage.dailyRequestsRemaining,
    } : id === 'gemini' ? {
      requestsToday: 0,
      dailyLimit: config.DISCOVERY_MAX_GEMINI_REQUESTS_PER_RUN,
      remaining: config.DISCOVERY_MAX_GEMINI_REQUESTS_PER_RUN,
    } : null;

    if (!isDatabaseConnected) return { ...summarizeProvider(id, cfg, null, null, false, keys, Date.now(), usage), history: [] };
    const where = { provider: id, configHash: cfg.configHash, origin: 'acceptance' };
    const [history, lastSuccess, grounded] = await Promise.all([
      prisma.providerVerification.findMany({ where, orderBy: { startedAt: 'desc' }, take: 5, select: exposed }),
      prisma.providerVerification.findFirst({ where: { ...where, status: 'verified' }, orderBy: { finishedAt: 'desc' }, select: { finishedAt: true } }),
      id === 'gemini' && prisma.providerVerification.findFirst({ where: { ...where, status: 'verified', leadId: { not: null } }, select: { id: true } }),
    ]);
    const summary = summarizeProvider(id, cfg, history[0] ?? null, lastSuccess?.finishedAt ?? null, Boolean(grounded), keys, Date.now(), usage);
    if (id !== 'overpass') return { ...summary, history };
    const cityChecks = await prisma.providerVerification.findMany({
      where: { ...where, locationKey: { in: keys } }, orderBy: { startedAt: 'desc' },
      distinct: ['locationKey'], select: { status: true, locationKey: true, evidence: true },
    });
    const verifiedCities = cityChecks.filter(check => check.status === 'verified' &&
      /^(node|way|relation)\/[1-9]\d*$/.test(String((check.evidence as { object?: string } | null)?.object ?? ''))).length;
    return { ...summary, passed: summary.passed && keys.length > 0 && verifiedCities === keys.length, history };
  }));
  const leads = isDatabaseConnected ? await prisma.lead.findMany({
    where: eligibleLead,
    take: 50,
    orderBy: { discoveryDate: 'desc' },
    select: { id: true, businessName: true },
  }) : [];
  const googleRevocationConfirmed = isDatabaseConnected && Boolean(await prisma.providerVerification.findFirst({
    where: { provider: 'google_places', origin: 'credential_revocation', status: 'verified',
      configHash: configuration('google_places').configHash, reason: 'GOOGLE_CLOUD_CONFIRMED' },
    select: { id: true },
  }));
  return {
    databaseAvailable: isDatabaseConnected,
    acceptance: googleRevocationConfirmed && checks.every(item => item.passed) ? 'passed' as const : 'withheld' as const,
    googleRevocationConfirmed,
    providers: checks,
    locations,
    leads,
  };
}

type Outcome = { message: string; httpStatus: number; evidence: Prisma.InputJsonObject; leadId?: string };

export async function verifyGeneration(leadId?: string): Promise<Outcome> {
  if (!leadId) {
    const challenge = randomUUID();
    const result = await generateGeminiJson('Return a JSON object with one field named check containing this exact value: ' + challenge);
    if (!z.strictObject({ check: z.literal(challenge) }).safeParse(result).success) throw new ProviderFailure('gemini', 'invalid_response', 200);
    return { message: 'Gemini generated the requested verification value.', httpStatus: 200, evidence: { model: config.GEMINI_MODEL } };
  }
  const lead = await prisma.lead.findFirst({ where: { id: leadId, ...eligibleLead }, select: { website: true } });
  if (!lead) throw new BadRequestError('Select a discovered CRM lead with inspected website evidence.');
  const inspection = await inspectListedWebsite(lead.website);
  if (inspection.status !== 'ANALYZED') throw new BadRequestError('Website evidence is unavailable for this lead.');
  const findings = measuredOpportunities(inspection.evidence);
  if (!findings.length) throw new BadRequestError('This page has no measured findings to rank.');
  const ranked = await rankGeminiEvidence(findings);
  return {
    message: 'Gemini ranked the measured findings saved with this CRM lead.',
    httpStatus: 200,
    leadId,
    evidence: { model: config.GEMINI_MODEL, inspectedAt: inspection.inspectedAt, ranked },
  };
}

function safeFailure(id: ReadinessProvider, cause: unknown) {
  if (cause instanceof BadRequestError) return { status: 'blocked', message: cause.message, reason: 'INPUT_REQUIRED', httpStatus: null };
  const failure = classifyProviderError(id, cause);
  return {
    status: failure.kind === 'rate_limit' ? 'rate_limited' : 'failed',
    message: failure.message,
    reason: failure instanceof GoogleDiagnostic ? failure.reason : failure.kind,
    httpStatus: failure.upstreamStatus ?? null,
  };
}

export async function verifyReadiness(id: ReadinessProvider, choice: Choice) {
  if (!isDatabaseConnected) throw new AppError('A migrated PostgreSQL database is required to record verification.', 503);
  if (config.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT) throw new AppError('Test processes cannot record live acceptance.', 409);
  const cfg = configuration(id);
  const profile = await getActiveIdealProfile();
  const location = profile?.targeting.locations.find(l => l.city && locationKey(l) === choice.locationKey);
  if (id === 'overpass' && !cfg.issue && !location) throw new BadRequestError('Select a city from the active targeting profile.');
  const check = await prisma.$transaction(async tx => {
    if (id === 'gemini') {
      await lockGeminiDispatch(tx);
      if (choice.requestId && await tx.providerVerification.findUnique({ where: { requestId: choice.requestId }, select: { id: true } })) return null;
      if (await hasGeminiDispatch(tx, new Date())) throw new ConflictError('A production Gemini request is in progress.');
    } else await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${'provider-readiness/' + id}))`;
    const previous = await tx.providerVerification.findFirst({ where: { provider: id, origin: 'acceptance' }, orderBy: { startedAt: 'desc' } });
    const wait = previous?.status === 'running' ? leaseMs : Math.max(30_000, id === 'overpass' ? config.OSM_OVERPASS_MIN_INTERVAL_MS : 0);
    if (previous && Date.now() - previous.startedAt.getTime() < wait) throw new ConflictError('A recent verification is in progress or cooling down. Refresh and try again shortly.');
    return tx.providerVerification.create({
      data: {
        provider: id, requestId: id === 'gemini' ? choice.requestId : undefined,
        configHash: cfg.configHash,
        status: 'running',
        message: 'Verification started.',
        locationKey: location && id === 'overpass' ? locationKey(location) : null,
      },
      select: { id: true },
    });
  });
  if (!check) return getReadiness();
  let data: Prisma.ProviderVerificationUncheckedUpdateInput;
  try {
    if (cfg.issue) data = { status: !cfg.configured ? 'missing_configuration' : 'blocked', message: cfg.issue };
    else {
      let result: Outcome;
      if (id === 'gemini') result = await verifyGeneration(choice.leadId);
      else if (id === 'google_places') {
        const client = discoveryService.getProvider(id);
        if (!(client instanceof GooglePlacesProvider)) throw new ProviderFailure(id, 'unavailable');
        const target = profile?.targeting.locations.find(l => l.city) ?? { city: 'Hyderabad', country: 'India' };
        const placeId = await client.verifyListing(target.city, target.country);
        result = { message: 'Places API (New) returned a named listing.', httpStatus: 200, evidence: { placeId, city: target.city, country: target.country } };
      } else if (id === 'serpapi') {
        const client = discoveryService.getProvider(id);
        if (!(client instanceof SerpApiProvider)) throw new ProviderFailure(id, 'unavailable');
        const status = await client.checkHealth(true);
        if (!status.isHealthy) throw new ProviderFailure(id, 'upstream_error', undefined, status.error ?? 'SerpApi returned an unhealthy response.');
        result = {
          message: 'SerpApi account status and search quota verified live.',
          httpStatus: 200,
          evidence: {
            latencyMs: status.latencyMs ?? null,
            lastChecked: status.lastChecked ?? new Date().toISOString(),
          },
        };
      } else {
        const client = discoveryService.getProvider(id);
        if (!(client instanceof OverpassProvider) || !profile || !location) throw new ProviderFailure(id, 'invalid_input');
        const object = await client.verifyCity({
          city: location.city,
          country: location.country,
          industry: 'Restaurants',
          maxLeads: 1,
          profileSnapshot: snapshotProfile(profile, location),
        });
        result = {
          message: 'Overpass returned a mapped business inside the selected boundary.',
          httpStatus: 200,
          evidence: { object, city: location.city, country: location.country },
        };
      }
      data = { status: 'verified', ...result };
    }
  } catch (cause) {
    data = safeFailure(id, cause);
  }
  await prisma.providerVerification.update({ where: { id: check.id }, data: { ...data, finishedAt: new Date() } });
  return getReadiness();
}
