import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import axios from 'axios';
import { config } from '../config';
import { prisma, initDatabaseConnection } from '../db/prisma';
import { analyzeOpportunities } from '../services/discovery/opportunityAnalysis';
import { enqueueGeminiRanking, geminiRetryDelay, processNextGeminiRanking } from '../services/geminiRankingQueue';
import { geminiConfigurationHash } from '../services/geminiTransport';
import type { WebsiteEvidence } from '../services/scraper';

const findings = [{ id: 'images', evidence: 'The stored page has two images without alternative text.' }];
const inspectedAt = '2026-11-23T14:00:00.000Z';
const testUrl = process.env.GEMINI_QUEUE_TEST_DATABASE_URL;

test('Gemini retries have bounded jitter and respect the provider retry floor', () => {
  assert.equal(geminiRetryDelay(1, 0, 0), 30000);
  assert.equal(geminiRetryDelay(2, 0, 0.5), 67500);
  assert.equal(geminiRetryDelay(3, 180000, 0), 180000);
});

test('deferred ranking retains measured opportunities without invoking Gemini', async context => {
  const outbound = context.mock.method(axios, 'post', () => { throw Error('unexpected request'); });
  const result = await analyzeOpportunities({
    businessName: 'Controlled fixture', industry: 'Retail', country: 'India', services: ['Website development'],
    inspection: { status: 'ANALYZED', inspectedAt, cached: false, evidence: {
      isResponsiveReady: true, isHttps: true, statusCode: 200, hasContactForm: true,
      imagesMissingAltCount: 2,
    } as WebsiteEvidence },
  }, { deferGemini: true });
  assert.equal(result.generatedBy, 'evidence_fallback');
  assert(result.opportunities.some(item => item.id === 'images'));
  assert.equal(outbound.mock.callCount(), 0);
});

describe('Durable Gemini ranking queue', { skip: !testUrl }, () => {
  // This suite must never connect to the workspace database.
  let db: typeof prisma;
  const oldKey = config.GEMINI_API_KEY;
  before(async () => {
    assert(testUrl && /\/phase17_gemini_queue_[a-z0-9_]+(?:\?|$)/i.test(testUrl));
    process.env.DATABASE_URL = testUrl;
    config.GEMINI_API_KEY = 'controlled-fixture-only';
    const { PrismaClient } = await import('@prisma/client');
    // Prisma resolves DATABASE_URL when the queue singleton first connects.
    db = prisma;
    assert(PrismaClient);
    assert(await initDatabaseConnection());
    assert.equal(await db.geminiRankingJob.count(), 0, 'Use a fresh, disposable database for this suite.');
  });
  after(async () => { config.GEMINI_API_KEY = oldKey; await db?.$disconnect(); });

  async function newJob(name: string) {
    const lead = await db.lead.create({ data: { businessName: name, opportunityScore: 76,
      discoveryEvidence: { analysis: { generatedBy: 'evidence_fallback' } } } });
    await Promise.all([1, 2].map(() => db.$transaction(tx => enqueueGeminiRanking(tx, lead.id, inspectedAt, findings))));
    assert.equal(await db.geminiRankingJob.count({ where: { leadId: lead.id } }), 1);
    return { lead, job: await db.geminiRankingJob.findFirstOrThrow({ where: { leadId: lead.id } }) };
  }
  async function makeDue(id: string) {
    await db.geminiRankingJob.update({ where: { id }, data: { availableAt: new Date(0) } });
    await db.geminiRetryCircuit.updateMany({ where: { id: geminiConfigurationHash() }, data: { nextRequestAt: null, openUntil: null } });
  }
  function fails(status: number, retryAfter?: string): never {
    throw { isAxiosError: true, response: { status, headers: { 'retry-after': retryAfter }, data: { error: { message: 'forbidden fixture secret' } } } };
  }

  test('deduplicates jobs and dispatches across workers, respects Retry-After, and stops after four transient failures', async context => {
    const { lead, job } = await newJob('Controlled retry fixture');
    const status = [429, 502, 503, 504];
    let calls = 0;
    context.mock.method(axios, 'post', async () => fails(status[calls++], calls === 1 ? '180' : undefined));
    const started = Date.now();
    const work = await Promise.all([processNextGeminiRanking(), processNextGeminiRanking()]);
    assert.equal(work.filter(Boolean).length, 1);
    assert.equal(calls, 1);
    let item = await db.geminiRankingJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(item.status, 'RETRYING');
    assert(item.availableAt.getTime() >= started + 180000);
    assert.equal(await processNextGeminiRanking(), false);
    for (let attempt = 2; attempt <= 4; attempt++) {
      await makeDue(job.id);
      assert.equal(await processNextGeminiRanking(), true);
      item = await db.geminiRankingJob.findUniqueOrThrow({ where: { id: job.id } });
      assert.equal(item.attempts, attempt);
      if (attempt === 3) {
        const circuit = await db.geminiRetryCircuit.findUniqueOrThrow({ where: { id: geminiConfigurationHash() } });
        assert(circuit.openUntil && circuit.openUntil.getTime() > Date.now() + 240000);
      }
    }
    assert.equal(calls, 4);
    assert.equal(item.status, 'FAILED');
    assert(!item.lastError?.includes('forbidden fixture secret'));
    assert.equal(await db.providerVerification.count({ where: { leadId: lead.id } }), 0);
    assert.deepEqual(await db.lead.findUniqueOrThrow({ where: { id: lead.id } }), lead);
  });

  test('recovers an undispatched job, preserves rankings and saves one validated production result', async context => {
    const { lead, job } = await newJob('Controlled success fixture');
    const old = await db.providerVerification.create({ data: { provider: 'gemini', leadId: lead.id, status: 'verified',
      message: 'Historical fixture', configHash: geminiConfigurationHash(), evidence: { ranked: ['historical'] }, finishedAt: new Date(0) } });
    await db.geminiRankingJob.update({ where: { id: job.id }, data: { status: 'CLAIMED', leaseToken: 'stale', leaseUntil: new Date(0) } });
    await makeDue(job.id);
    const mock = context.mock.method(axios, 'post', async () => ({ data: { candidates: [{
      finishReason: 'STOP', content: { parts: [{ text: '{"orderedEvidenceIds":["images"]}' }] },
    }] } }));
    assert.equal(await processNextGeminiRanking(), true);
    assert.equal(await processNextGeminiRanking(), false);
    assert.equal(mock.mock.callCount(), 1);
    const verified = await db.providerVerification.findUniqueOrThrow({ where: { rankingJobId: job.id } });
    assert.equal(verified.origin, 'production');
    assert.deepEqual(verified.evidence, { model: config.GEMINI_MODEL, inspectedAt, ranked: [findings[0].evidence] });
    assert.deepEqual(await db.providerVerification.findUniqueOrThrow({ where: { id: old.id } }), old);
    assert.deepEqual(await db.lead.findUniqueOrThrow({ where: { id: lead.id } }), lead);
  });

  test('stops on missing credentials, unsupported models, malformed input, invented IDs or ambiguous previous dispatch', async context => {
    let http = 400;
    const mock = context.mock.method(axios, 'post', async () => {
      if (http !== 200) fails(http);
      return { data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"orderedEvidenceIds":["invented"]}' }] } }] } };
    });
    for (const code of [400, 401, 404, 200]) {
      http = code;
      const { job } = await newJob('Controlled permanent failure ' + code);
      await makeDue(job.id);
      assert.equal(await processNextGeminiRanking(), true);
      const row = await db.geminiRankingJob.findUniqueOrThrow({ where: { id: job.id } });
      assert.equal(row.status, 'FAILED');
      assert.equal(row.attempts, 1);
      assert.equal(await db.providerVerification.count({ where: { rankingJobId: job.id } }), 0);
    }
    const { job } = await newJob('Controlled lost response fixture');
    await db.geminiRankingJob.update({ where: { id: job.id }, data: { status: 'SENDING', attempts: 1, leaseToken: 'uncertain', leaseUntil: new Date(0) } });
    await makeDue(job.id);
    assert.equal(await processNextGeminiRanking(), false);
    const lost = await db.geminiRankingJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(lost.status, 'FAILED');
    assert.match(lost.lastError ?? '', /outcome is unknown/);
    assert.equal(mock.mock.callCount(), 4);
  });
});
