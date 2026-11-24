import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type GeminiRankingJob } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config';
import { prisma, isDatabaseConnected } from '../db/prisma';
import { logger } from '../utils/logger';
import { classifyProviderError, ProviderFailure } from './discovery/providerErrors';
import { GoogleDiagnostic } from './discovery/googleDiagnostic';
import { geminiConfigurationHash, geminiFindingSchema, rankGeminiEvidence, type GeminiFinding } from './geminiTransport';

const maxAttempts = 4;
const leaseMs = 45_000;
const intervalMs = 13_000;
const circuitCooldown = 5 * 60_000;
const transient = new Set([429, 502, 503, 504]);
const jobEvidence = z.array(geminiFindingSchema).min(1).max(7);

export function geminiRetryDelay(attempt: number, retryAfterMs = 0, jitter = Math.random()) {
  return Math.max(retryAfterMs, Math.round(30_000 * 2 ** (attempt - 1) * (1 + jitter * 0.25)));
}

export function productionGeminiEnabled() {
  return Boolean(config.GEMINI_API_KEY.trim()) && config.DISCOVERY_MAX_GEMINI_REQUESTS_PER_RUN > 0;
}

export async function enqueueGeminiRanking(tx: Prisma.TransactionClient, leadId: string, inspectedAt: string, input: GeminiFinding[], discoveryRunId?: string) {
  if (discoveryRunId && await tx.geminiRankingJob.count({ where: { discoveryRunId } }) >= config.DISCOVERY_MAX_GEMINI_REQUESTS_PER_RUN) return;
  const findings = jobEvidence.parse(input.map(({ id, evidence }) => ({ id, evidence })));
  const normalized = [...findings].sort((a, b) => a.id.localeCompare(b.id));
  const evidenceKey = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  await tx.geminiRankingJob.createMany({ data: {
    leadId, model: config.GEMINI_MODEL, configHash: geminiConfigurationHash(), discoveryRunId, evidenceKey, evidence: normalized, inspectedAt: new Date(inspectedAt),
  }, skipDuplicates: true });
}

export async function lockGeminiDispatch(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('gemini-dispatch'))`;
}

export async function hasGeminiDispatch(tx: Prisma.TransactionClient, now: Date) {
  return Boolean(await tx.geminiRankingJob.findFirst({
    where: { status: { in: ['CLAIMED', 'SENDING'] }, leaseUntil: { gt: now } }, select: { id: true },
  }));
}

async function claim(now = new Date()) {
  return prisma.$transaction(async tx => {
    await lockGeminiDispatch(tx);
    // Reclaim only work that had never reserved an HTTP dispatch.
    await tx.geminiRankingJob.updateMany({ where: { status: 'CLAIMED', leaseUntil: { lte: now } },
      data: { status: 'QUEUED', leaseUntil: null, leaseToken: null } });
    await tx.geminiRankingJob.updateMany({ where: { status: 'SENDING', leaseUntil: { lte: now } },
      data: { status: 'FAILED', lastStatus: null, lastError: 'The worker stopped after reserving the request. Provider outcome is unknown.', leaseUntil: null, leaseToken: null } });
    if (await hasGeminiDispatch(tx, now)) return null;
    const acceptance = await tx.providerVerification.findFirst({ where: { provider: 'gemini', origin: 'acceptance',
      status: 'running', startedAt: { gt: new Date(now.getTime() - 120_000) } }, select: { id: true } });
    if (acceptance) return null;
    const configHash = geminiConfigurationHash();
    const circuit = await tx.geminiRetryCircuit.findUnique({ where: { id: configHash } });
    if ((circuit?.openUntil && circuit.openUntil > now) || (circuit?.nextRequestAt && circuit.nextRequestAt > now)) return null;
    const job = await tx.geminiRankingJob.findFirst({ where: { configHash, status: { in: ['QUEUED', 'RETRYING'] }, availableAt: { lte: now } },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
    if (!job) return null;
    return tx.geminiRankingJob.update({ where: { id: job.id }, data: {
      status: 'CLAIMED', leaseToken: randomUUID(), leaseUntil: new Date(now.getTime() + leaseMs),
    } });
  });
}

async function beginDispatch(job: GeminiRankingJob, now: Date) {
  return prisma.$transaction(async tx => {
    await lockGeminiDispatch(tx);
    const updated = await tx.geminiRankingJob.updateMany({ where: {
      id: job.id, status: 'CLAIMED', leaseToken: job.leaseToken, leaseUntil: { gt: now },
    }, data: { status: 'SENDING', attempts: { increment: 1 }, leaseUntil: new Date(now.getTime() + leaseMs) } });
    if (!updated.count) return false;
    const nextRequestAt = new Date(now.getTime() + intervalMs);
    await tx.geminiRetryCircuit.upsert({ where: { id: job.configHash },
      create: { id: job.configHash, nextRequestAt }, update: { nextRequestAt } });
    return true;
  });
}

async function finish(job: GeminiRankingJob, startedAt: Date, result: string[] | ProviderFailure) {
  await prisma.$transaction(async tx => {
    await lockGeminiDispatch(tx);
    const now = new Date();
    const owned = await tx.geminiRankingJob.findFirst({ where: { id: job.id, status: 'SENDING',
      leaseToken: job.leaseToken, leaseUntil: { gt: now } } });
    if (!owned) return;
    const circuit = await tx.geminiRetryCircuit.findUniqueOrThrow({ where: { id: job.configHash } });
    if (Array.isArray(result)) {
      await tx.providerVerification.create({ data: {
        provider: 'gemini', origin: 'production', rankingJobId: job.id, configHash: job.configHash, leadId: job.leadId,
        startedAt, finishedAt: now, status: 'verified', httpStatus: 200, message: 'Gemini ranked the measured findings in the production queue.',
        evidence: { model: job.model, inspectedAt: job.inspectedAt.toISOString(), ranked: result },
      } });
      await tx.geminiRankingJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', lastStatus: 200,
        lastError: null, leaseToken: null, leaseUntil: null } });
      await tx.geminiRetryCircuit.update({ where: { id: job.configHash }, data: { failures: 0, openUntil: null } });
      return;
    }
    const httpStatus = result.upstreamStatus ?? null;
    const temporary = httpStatus !== null && transient.has(httpStatus);
    const retry = temporary && owned.attempts < maxAttempts;
    const failures = temporary ? circuit.failures + 1 : 0;
    const holdMs = temporary ? Math.max(result.retryAfterMs ?? 0, failures >= 3 ? circuitCooldown : 0) : 0;
    const openUntil = holdMs ? new Date(now.getTime() + holdMs) : null;
    const nextRequestAt = temporary ? new Date(now.getTime() + Math.max(intervalMs, holdMs)) : circuit.nextRequestAt;
    await tx.geminiRetryCircuit.update({ where: { id: job.configHash }, data: { failures: failures >= 3 ? 0 : failures, openUntil, nextRequestAt } });
    await tx.geminiRankingJob.update({ where: { id: job.id }, data: {
      status: retry ? 'RETRYING' : 'FAILED', leaseToken: null, leaseUntil: null,
      availableAt: retry ? new Date(now.getTime() + Math.max(holdMs, geminiRetryDelay(owned.attempts, result.retryAfterMs))) : owned.availableAt,
      lastStatus: httpStatus,
      lastError: result instanceof GoogleDiagnostic || httpStatus === 200 ? result.message
        : 'Gemini generation failed' + (httpStatus ? ' with HTTP ' + httpStatus : ' before a confirmed response') + '.',
    } });
  });
}

export async function processNextGeminiRanking() {
  if (!isDatabaseConnected || !productionGeminiEnabled()) return false;
  const job = await claim();
  if (!job) return false;
  const startedAt = new Date();
  if (!await beginDispatch(job, startedAt)) return false;
  let result: string[] | ProviderFailure;
  try {
    result = await rankGeminiEvidence(jobEvidence.parse(job.evidence));
  } catch (error) {
    result = classifyProviderError('gemini', error);
  }
  await finish(job, startedAt, result);
  return true;
}

export function startGeminiRankingWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processNextGeminiRanking(); }
    catch { logger.error('Gemini ranking worker could not process its queue.'); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); }, 5000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
