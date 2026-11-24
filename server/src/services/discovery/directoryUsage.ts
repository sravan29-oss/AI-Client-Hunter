import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from '../../config';
import { isDatabaseConnected, prisma } from '../../db/prisma';
import { ProviderFailure, classifyProviderError } from './providerErrors';

const limits: Record<string, number> = {
  google_places: config.GOOGLE_PLACES_DAILY_REQUEST_LIMIT,
  serpapi: config.SERPAPI_DAILY_REQUEST_LIMIT,
  overpass: config.OSM_OVERPASS_DAILY_REQUEST_LIMIT,
  nominatim: config.OSM_NOMINATIM_DAILY_REQUEST_LIMIT,
};
type Usage = { requests: number; lastSuccessAt: Date | null; lastError: string | null };
const temporaryUsage = new Map<string, Usage>();

export interface DiscoveryBudget {
  directoryRequests: number;
  geminiRequests: number;
  geminiLimit: number;
  job?: { id: string; leaseToken: string };
}

const budgetContext = new AsyncLocalStorage<DiscoveryBudget>();

export function withDiscoveryBudget<T>(budget: DiscoveryBudget, run: () => T) {
  return budgetContext.run(budget, run);
}

export async function takeGeminiRequest() {
  const budget = budgetContext.getStore();
  if (!budget) return true;
  if (budget.geminiRequests >= budget.geminiLimit) return false;
  if (budget.job && isDatabaseConnected) {
    const { id, leaseToken } = budget.job;
    const [reserved] = await prisma.$queryRaw<Array<{ geminiRequestsUsed: number }>>`
      UPDATE "AutoHunterLog" SET "geminiRequestsUsed" = "geminiRequestsUsed" + 1
      WHERE "id" = ${id} AND "leaseToken" = ${leaseToken} AND "leaseUntil" > NOW() AND "stopRequestedAt" IS NULL
        AND "geminiRequestsUsed" < ${budget.geminiLimit}
      RETURNING "geminiRequestsUsed"
    `;
    if (!reserved) return false;
    budget.geminiRequests = Math.max(budget.geminiRequests, reserved.geminiRequestsUsed);
    return true;
  }
  budget.geminiRequests++;
  return true;
}

export function directoryEnabled(id: string) {
  return limits[id] !== 0;
}

export function setDirectoryLimit(id: string, limit: number) {
  limits[id] = limit;
}

function utcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function key(id: string, day: Date) {
  return id + ':' + day.toISOString();
}

export async function directoryUsage(id: string) {
  const limit = limits[id];
  if (limit === undefined) return undefined;
  const day = utcDay(new Date());
  const today = isDatabaseConnected
    ? await prisma.directoryUsageDay.findUnique({ where: { providerId_day: { providerId: id, day } } })
    : temporaryUsage.get(key(id, day));
  const lastSuccess = today?.lastSuccessAt ?? (isDatabaseConnected
    ? (await prisma.directoryUsageDay.findFirst({
        where: { providerId: id, lastSuccessAt: { not: null } }, orderBy: { lastSuccessAt: 'desc' },
      }))?.lastSuccessAt
    : [...temporaryUsage.entries()].reverse().find(([name, usage]) => name.startsWith(id + ':') && usage.lastSuccessAt)?.[1].lastSuccessAt);
  return { enabled: limit > 0, requestsToday: today?.requests ?? 0, dailyRequestLimit: limit,
    dailyRequestsRemaining: Math.max(0, limit - (today?.requests ?? 0)), lastSuccessfulRequestAt: lastSuccess?.toISOString(),
    lastRequestError: today?.lastError ?? undefined };
}

export async function directoryRequest<T>(id: string, send: () => Promise<T>): Promise<T> {
  const limit = limits[id];
  if (limit === undefined) return send();
  if (limit === 0) throw new ProviderFailure(id, 'invalid_input', undefined, 'This provider is disabled by its backend daily request limit.');
  const day = utcDay(new Date());
  const temporaryKey = key(id, day);
  let usage = temporaryUsage.get(temporaryKey);
  let reserved: boolean;
  if (isDatabaseConnected) {
    const updated = await prisma.$executeRaw`
      INSERT INTO "DirectoryUsageDay" ("providerId", "day", "requests") VALUES (${id}, ${day}::date, 1)
      ON CONFLICT ("providerId", "day") DO UPDATE SET "requests" = "DirectoryUsageDay"."requests" + 1
      WHERE "DirectoryUsageDay"."requests" < ${limit}
    `;
    reserved = updated === 1;
  } else {
    usage ??= { requests: 0, lastSuccessAt: null, lastError: null };
    if (temporaryUsage.size >= 64 && !temporaryUsage.has(temporaryKey)) temporaryUsage.delete(temporaryUsage.keys().next().value!);
    temporaryUsage.set(temporaryKey, usage);
    reserved = usage.requests < limit;
    if (reserved) usage.requests++;
  }
  if (!reserved) throw new ProviderFailure(id, 'rate_limit', 429, 'The configured daily provider request limit has been reached.', day.getTime() + 86400000 - Date.now());
  const budget = budgetContext.getStore();
  if (budget) budget.directoryRequests++;

  let failure: ProviderFailure | undefined;
  try { return await send(); }
  catch (error) { failure = classifyProviderError(id, error); throw error; }
  finally {
    const data = failure ? { lastError: failure.message } : { lastSuccessAt: new Date() };
    if (isDatabaseConnected) {
      // The reservation remains accurate if recording the request outcome fails.
      await prisma.directoryUsageDay.update({ where: { providerId_day: { providerId: id, day } }, data }).catch(() => {});
    } else if (usage) Object.assign(usage, data);
  }
}
