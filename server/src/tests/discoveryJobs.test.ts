import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateNextRun, isValidTimeZone, selectSegment } from '../services/discovery/discoverySchedule';
import type { SchedulerConfig } from '../services/schedulerService';

const config: SchedulerConfig = {
  enabled: true, scheduleMode: 'DAILY', scheduledTime: '00:30', timezone: 'Asia/Kolkata',
  targetCountries: ['India', 'United Kingdom', 'Canada'],
  targetCities: ['Mumbai', 'London', 'Québec (Canada)'],
  targetIndustries: ['Restaurants', 'Retail shops'], minOpportunityScore: 60, maxLeadsPerRun: 10,
  preferredProvider: 'openstreetmap', notifyInApp: true, notifyEmail: false, notifyTelegram: false,
};

describe('Discovery schedule', () => {
  it('honors local midnight and weekly Mondays even when UTC is on another date', () => {
    assert.equal(calculateNextRun(config, new Date('2026-11-20T18:58:00Z'))?.toISOString(), '2026-11-20T19:00:00.000Z');
    assert.equal(calculateNextRun({ ...config, scheduleMode: 'WEEKLY' }, new Date('2026-11-21T15:00:00Z'))?.toISOString(), '2026-11-22T19:00:00.000Z');
    assert.equal(calculateNextRun({ ...config, enabled: false }), null);
    assert.equal(isValidTimeZone('Invalid/Zone'), false);
  });

  it('skips a nonexistent local time and avoids a second run in a daylight-saving fold', () => {
    const eastern = { ...config, timezone: 'America/New_York', scheduledTime: '02:30' };
    assert.equal(calculateNextRun(eastern, new Date('2027-03-14T05:00:00Z'))?.toISOString(), '2027-03-15T06:30:00.000Z');
    const fold = { ...eastern, scheduledTime: '01:30' };
    const first = new Date('2026-11-01T05:30:00Z');
    assert.equal(calculateNextRun(fold, new Date('2026-11-01T04:00:00Z'))?.getTime(), first.getTime());
    assert.equal(calculateNextRun(fold, first, first)?.toISOString(), '2026-11-02T06:30:00.000Z');
  });

  it('rotates countries and industries while keeping cities in their associated countries', () => {
    assert.deepEqual([0, 1, 2, 3].map((index) => {
      const item = selectSegment(config, index);
      return [item.country, item.city, item.industry];
    }), [
      ['India', 'Mumbai', 'Restaurants'], ['United Kingdom', 'London', 'Restaurants'],
      ['Canada', 'Québec', 'Restaurants'], ['India', 'Mumbai', 'Retail shops'],
    ]);
  });
});

const databaseUrl = process.env.DISCOVERY_TEST_DATABASE_URL;
describe('Persistent discovery queue and forwarding', { skip: !databaseUrl }, () => {
  let queue: (typeof import('../services/discovery/discoveryJobs'))['discoveryJobs'];
  let db: (typeof import('../db/prisma'))['prisma'];
  let cycle: typeof import('../services/discovery/discoveryCycle');
  let provider: (typeof import('../services/discovery/discoveryService'))['discoveryService'];

  before(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    process.env.GEMINI_API_KEY = '';
    const database = await import('../db/prisma');
    db = database.prisma;
    assert.equal(await database.initDatabaseConnection(), true);
    assert.equal(await db.autoHunterLog.count(), 0, 'Use a fresh, disposable test database.');
    assert.equal(await db.lead.count(), 0, 'Use a fresh, disposable test database.');
    queue = (await import('../services/discovery/discoveryJobs')).discoveryJobs;
    cycle = await import('../services/discovery/discoveryCycle');
    provider = (await import('../services/discovery/discoveryService')).discoveryService;
  });

  after(async () => { await db?.$disconnect(); });

  it('queues a missed schedule once even when two workers race and fences an expired worker', async () => {
    const segment = selectSegment(config, 0);
    const due = new Date(Date.now() - 60000);
    const next = new Date(Date.now() + 3600000);
    await db.autoHunterConfig.create({ data: { id: 'default', enabled: true, nextRunAt: due } });
    const queued = await Promise.all([queue.enqueueScheduled(segment, due, next), queue.enqueueScheduled(segment, due, next)]);
    assert.equal(queued.filter(Boolean).length, 1);
    assert.equal(await queue.enqueueManual(segment), undefined);
    const saved = await db.autoHunterConfig.findUniqueOrThrow({ where: { id: 'default' } });
    assert.equal(saved.nextRunAt?.toISOString(), next.toISOString());

    const claims = await Promise.all([queue.claim(), queue.claim()]);
    assert.equal(claims.filter(Boolean).length, 1);
    const worker = claims.find(Boolean)!;
    await db.$executeRaw`UPDATE "AutoHunterLog" SET "leaseUntil" = NOW() - INTERVAL '1 second' WHERE "id" = ${worker.id}`;
    const replacement = await queue.claim();
    assert.equal(replacement.id, worker.id);
    assert.equal(replacement.attempts, 2);
    assert.equal(await queue.renew(worker), false);
    assert.equal(await queue.finish(worker, cycle.emptyDiscoveryResult()), undefined);
    assert.equal(await queue.requestStop(), true);
    assert.equal((await queue.finish(replacement, cycle.emptyDiscoveryResult())).status, 'STOPPED');
  });

  it('backs off provider failures using the same persistent job, then records the final outcome', async (t) => {
    t.mock.method(provider, 'search', async () => ({ providerId: 'fixture', providerName: 'Fixture', leads: [], errors: 'Provider timed out', totalFound: 0, timestamp: new Date().toISOString() }));
    const segment = selectSegment(config, 0);
    const id = await queue.enqueueManual(segment);
    const first = await queue.claim();
    assert.equal(first.id, id);
    const failed = await cycle.runDiscoveryCycle(config, first, () => true, first);
    assert.equal(failed.retrySearch, true);
    assert.equal((await queue.finish(first, failed)).status, 'QUEUED');
    assert.equal(await queue.claim(), undefined);
    for (let attempt = 2; attempt <= 3; attempt++) {
      await db.$executeRaw`UPDATE "AutoHunterLog" SET "availableAt" = NOW() WHERE "id" = ${id}`;
      const job = await queue.claim();
      assert.equal(job.attempts, attempt);
      const result = await queue.finish(job, failed);
      assert.equal(result.status, attempt < 3 ? 'QUEUED' : 'FAILED');
    }
  });

  it('saves a qualified lead, unsent draft and in-app alert together, then skips repeat delivery', async (t) => {
    const fixture = {
      businessName: 'Discovery verification fixture', website: null, country: 'India', city: 'Mumbai',
      industry: 'Restaurants', source: 'Test fixture', providerId: 'fixture', providerName: 'Fixture',
      discoveryDate: new Date().toISOString(), detectedProblems: [], suggestedServices: [], opportunityScore: 80,
      contactStatus: { websiteStatus: 'unavailable', phoneStatus: 'unavailable', emailStatus: 'unavailable' },
    } as const;
    t.mock.method(provider, 'search', async () => ({
      providerId: 'fixture', providerName: 'Fixture', leads: [fixture], totalFound: 1, timestamp: new Date().toISOString(),
    }));
    for (let run = 1; run <= 2; run++) {
      await queue.enqueueManual(selectSegment(config, 0));
      const job = await queue.claim();
      const result = await cycle.runDiscoveryCycle(config, job, () => true, job);
      assert.equal(result.status, 'SUCCESS', String(result.errorDetails));
      assert.equal(result.qualifiedCount, run === 1 ? 1 : 0);
      assert.equal(result.duplicatesCount, run === 2 ? 1 : 0);
      await queue.finish(job, result);
    }
    const lead = await db.lead.findFirstOrThrow({ where: { businessName: fixture.businessName }, include: { pitches: true, notifications: true } });
    assert.equal(lead.pitches.length, 1);
    assert.equal(lead.pitches[0].status, 'DRAFT');
    assert.equal(lead.pitches[0].sentAt, null);
    assert.equal(lead.notifications.length, 1);
    assert.equal(lead.businessEmail, null);
    assert.equal(lead.publicBusinessPhone, null);
  });

  it('leaves no new lead or notification when draft preparation fails', async (t) => {
    const { geminiService } = await import('../services/gemini');
    t.mock.method(geminiService, 'generateOutreach', async () => { throw new Error('Draft provider unavailable'); });
    t.mock.method(provider, 'search', async () => ({
      providerId: 'fixture', providerName: 'Fixture', totalFound: 1, timestamp: new Date().toISOString(),
      leads: [{
        businessName: 'Incomplete qualification fixture', website: null, country: 'India', industry: 'Healthcare',
        source: 'Test fixture', detectedProblems: [], suggestedServices: [],
      }],
    }));
    await queue.enqueueManual(selectSegment(config, 0));
    const job = await queue.claim();
    const notificationsBefore = await db.notification.count();
    const result = await cycle.runDiscoveryCycle(config, job, () => true, job);
    assert.equal(result.status, 'PARTIAL');
    assert.equal(result.qualifiedCount, 0);
    assert.equal(await db.lead.count({ where: { businessName: 'Incomplete qualification fixture' } }), 0);
    assert.equal(await db.notification.count(), notificationsBefore);
    await queue.finish(job, result);
  });

  it('returns a single canonical lead across 12 simultaneous durable writes', async () => {
    const { createOrFindLead } = await import('../db/leadIdentity');
    const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => createOrFindLead({
      businessName: 'Concurrent identity fixture', country: 'India',
      website: index % 2 ? 'https://www.phase15-concurrent.example./path' : 'https://phase15-concurrent.example',
    })));
    assert.equal(responses.filter((response) => response.created).length, 1);
    assert.equal(new Set(responses.map((response) => response.lead.id)).size, 1);
    assert.equal(await db.lead.count({ where: { businessName: 'Concurrent identity fixture' } }), 1);
  });

  it('attaches additional provider references to a single canonical address without replacing its source', async () => {
    const { createOrFindLead } = await import('../db/leadIdentity');
    const discoveryDate = '2026-11-22T15:00:00.000Z';
    const create = (providerId: string, reference: string, address: string, businessName = 'Address identity fixture') => createOrFindLead({
      businessName, country: 'India', source: providerId, discoveryDate,
      observation: { providerId, reference, address, discoveryDate },
    });
    const first = await create('overpass', 'node/1701', '42 Fixture Road, Pune');
    const duplicates = await Promise.all(Array.from({ length: 8 }, () => create('google_places', 'place-1701', '42 FIXTURE ROAD PUNE')));
    assert.ok(duplicates.every((item) => !item.created && item.lead.id === first.lead.id && item.lead.source === 'overpass'));
    const renamed = await create('google_places', 'place-1701', '42 Fixture Rd, Pune', 'Renamed provider fixture');
    assert.equal(renamed.lead.id, first.lead.id);
    assert.equal(await db.leadDiscoverySource.count({ where: { leadId: first.lead.id } }), 2);
    const differentBranch = await create('google_places', 'place-1702', '56 Fixture Road, Pune');
    assert.equal(differentBranch.created, true);
  });

  it('reserves daily directory requests and per-job Gemini requests atomically', async () => {
    const { directoryRequest, directoryUsage, takeGeminiRequest, withDiscoveryBudget } = await import('../services/discovery/directoryUsage');
    const { config: env } = await import('../config');
    const day = new Date(new Date().toISOString().slice(0, 10));
    const limit = env.SERPAPI_DAILY_REQUEST_LIMIT;
    await db.directoryUsageDay.create({ data: { providerId: 'serpapi', day, requests: limit - 1 } });
    let sends = 0;
    const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => directoryRequest('serpapi', async () => { sends++; })));
    assert.equal(sends, 1);
    assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 4);
    assert.equal((await directoryUsage('serpapi'))?.dailyRequestsRemaining, 0);
    await queue.enqueueManual(selectSegment(config, 0));
    const job = await queue.claim();
    const reserve = () => withDiscoveryBudget({ job, directoryRequests: 0, geminiRequests: 0, geminiLimit: 1 }, () => takeGeminiRequest());
    assert.equal((await Promise.all([reserve(), reserve(), reserve()])).filter(Boolean).length, 1);
    assert.equal((await db.autoHunterLog.findUniqueOrThrow({ where: { id: job.id } })).geminiRequestsUsed, 1);
    await queue.finish(job, cycle.emptyDiscoveryResult());
  });

  it('keeps a durable OSM identity across listing changes and preserves discovery provenance', async () => {
    const { createOrFindLead } = await import('../db/leadIdentity');
    const osmObject = { type: 'node', id: 91872634 } as const;
    const observed = '2026-11-01T08:22:03.000Z';
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => createOrFindLead({
      businessName: `Mapped listing ${index}`, website: `https://mapped-${index}.example`,
      country: 'Germany', source: '© OpenStreetMap contributors', discoveryDate: observed, osmObject,
    })));
    assert.equal(results.filter((result) => result.created).length, 1);
    const saved = results[0].lead;
    assert.equal(new Set(results.map((result) => result.lead.id)).size, 1);
    assert.equal(saved.discoveryDate?.toISOString(), observed);
    assert.equal(saved.source, '© OpenStreetMap contributors');
    const sameNumber = await createOrFindLead({ businessName: 'Mapped way fixture', country: 'Germany', osmObject: { ...osmObject, type: 'way' } });
    assert.equal(sameNumber.created, true);
    const alias = await db.leadIdentity.findUniqueOrThrow({ where: { key: `osm:node/${osmObject.id}` } });
    assert.equal(alias.leadId, saved.id);
  });

  it('persists separate due locations, filters and deduplicates profile runs, and fences stale targets', async (t) => {
    const { idealProfileSchema } = await import('../services/idealProfileTypes');
    const { createIdealProfile, setActiveIdealProfile, duplicateIdealProfile, saveIdealProfile } = await import('../services/idealClientProfiles');
    const { schedulerService } = await import('../services/schedulerService');
    const activeConfig = await schedulerService.updateConfig({ ...config, scheduleMode: 'MANUAL', preferredProvider: 'overpass' });
    const schedule = { mode: 'DAILY' as const, time: '12:00', timezone: 'UTC' };
    const input = idealProfileSchema.parse({ name: 'Configured discovery fixture', targeting: {
      locations: [{ country: 'IN', city: 'Pune', schedule }, { country: 'GB', city: 'London', schedule }],
      industries: ['Restaurants', 'Retail stores'], services: ['Business website'], categories: ['Restaurant'], minLeadScore: 45,
    } });
    const created = await createIdealProfile(input);
    const copy = await duplicateIdealProfile(created.id, created.revision, 'Saved copy');
    assert.deepEqual(copy.targeting, created.targeting);
    const active = await setActiveIdealProfile(created.id, created.revision, true);
    const now = new Date('2026-11-21T12:00:00Z');
    await queue.enqueueProfileScheduled(activeConfig, active, new Date(+now - 1000));
    const reserved = await Promise.all([queue.enqueueProfileScheduled(activeConfig, active, now), queue.enqueueProfileScheduled(activeConfig, active, now)]);
    assert.equal(reserved.filter(Boolean).length, 1);
    const first = (await queue.claim())!;
    assert.equal(first.city, 'London');
    assert.equal(first.profileSnapshot?.scheduledFor, now.toISOString());
    await queue.finish(first, cycle.emptyDiscoveryResult());
    assert.ok(await queue.enqueueProfileScheduled(activeConfig, active, now));
    const second = (await queue.claim())!;
    assert.equal(second.city, 'Pune');
    assert.equal(second.profileSnapshot?.scheduledFor, first.profileSnapshot?.scheduledFor);

    const adapter = provider.getProvider('overpass')!;
    t.mock.method(adapter, 'isConfigured', () => true);
    const search = t.mock.method(adapter, 'search', async () => ({ providerId: 'overpass', providerName: 'Fixture', totalFound: 2, timestamp: now.toISOString(), leads: [
      { businessName: 'Profile restaurant fixture', country: 'India', city: 'Pune', industry: 'Restaurants', source: 'Profile fixture', providerId: 'overpass', providerName: 'Fixture',
        discoveryDate: now.toISOString(), osmObject: { type: 'node' as const, id: 18266 }, listingEvidence: { mappedBoundary: true, categories: ['restaurant'] },
        detectedProblems: [], suggestedServices: [], opportunityScore: 0, contactStatus: { websiteStatus: 'unavailable' as const, phoneStatus: 'unavailable' as const, emailStatus: 'unavailable' as const } },
      { businessName: 'Wrong category fixture', country: 'India', city: 'Pune', industry: 'Restaurants', source: 'Profile fixture', providerId: 'overpass', providerName: 'Fixture',
        discoveryDate: now.toISOString(), listingEvidence: { mappedBoundary: true, categories: ['shop'] }, detectedProblems: [], suggestedServices: [], opportunityScore: 0,
        contactStatus: { websiteStatus: 'unavailable' as const, phoneStatus: 'unavailable' as const, emailStatus: 'unavailable' as const } },
    ] }));
    const result = await cycle.runDiscoveryCycle(activeConfig, second, () => true, second);
    assert.equal(result.qualifiedCount, 1, String(result.errorDetails));
    assert.equal(result.discoveredCount, 2);
    assert.equal(result.metrics?.rejected, 1);
    await queue.finish(second, result);
    const saved = await db.lead.findFirstOrThrow({ where: { businessName: 'Profile restaurant fixture' }, include: { pitches: true } });
    assert.equal(saved.discoveryDate?.toISOString(), now.toISOString());
    assert.equal((saved.profileMatch as any)?.profileName, active.name);
    assert.equal(saved.websiteAnalysisStatus, 'NOT_LISTED');
    assert.equal(saved.leadStatus, 'Qualified');
    assert.equal(saved.pitches[0].sentAt, null);
    const [lastSearch] = await db.discoverySearch.findMany({ orderBy: { createdAt: 'desc' }, take: 1 });
    assert.equal((lastSearch.filters as any)?.filteredOut, 1);

    assert.ok(await schedulerService.queueManualRun('IN:pune'));
    const duplicate = (await queue.claim())!;
    const duplicateResult = await cycle.runDiscoveryCycle(activeConfig, duplicate, () => true, duplicate);
    assert.equal(duplicateResult.duplicatesCount, 1);
    assert.equal(await db.lead.count({ where: { businessName: saved.businessName } }), 1);
    await queue.finish(duplicate, duplicateResult);
    assert.ok(await schedulerService.queueManualRun('IN:pune'));
    const stale = (await queue.claim())!;
    const updated = await saveIdealProfile(active.id, active.revision, { ...input, name: 'Revised targets' });
    await assert.rejects(saveIdealProfile(active.id, active.revision, input), /profile changed/i);
    const stopped = await cycle.runDiscoveryCycle(activeConfig, stale, () => true, stale);
    assert.equal(stopped.status, 'STOPPED');
    assert.equal(search.mock.callCount(), 2);
    await queue.finish(stale, stopped);
    const switched = await setActiveIdealProfile(copy.id, copy.revision, true);
    assert.equal(await db.idealClientProfile.count({ where: { active: true } }), 1);
    assert.ok(updated.revision > active.revision);
    await setActiveIdealProfile(switched.id, switched.revision, false);
    await schedulerService.updateConfig({ enabled: false });
  });

  it('retries known delivery failures and never reclaims a sent or uncertain delivery', async (t) => {
    const { queueLeadDeliveries, processNotificationDeliveries, listNotificationDeliveries } = await import('../services/notificationDelivery');
    const { notificationService } = await import('../services/notificationService');
    const { createOrFindLead } = await import('../db/leadIdentity');
    const { lead } = await createOrFindLead({ businessName: 'Delivery fixture', country: 'India' });
    const prefs = { ...config, notifyEmail: true, notificationEmail: 'fixture@example.test' };
    await db.$transaction((tx) => queueLeadDeliveries(tx, lead.id, prefs));
    await db.$transaction((tx) => queueLeadDeliveries(tx, lead.id, prefs));
    let attempt = 0;
    const delivery = t.mock.method(notificationService, 'deliverLeadAlert', async () => {
      attempt++;
      return attempt === 1 ? { status: 'RETRYING' as const, reason: 'Temporary response' } : { status: 'DELIVERED' as const };
    });
    await Promise.all([processNotificationDeliveries(), processNotificationDeliveries()]);
    let [record] = (await listNotificationDeliveries()).filter((item) => item.leadId === lead.id);
    assert.equal(record.status, 'RETRYING');
    assert.equal(record.attempts, 1);
    assert.equal(delivery.mock.callCount(), 1);
    await processNotificationDeliveries();
    assert.equal(delivery.mock.callCount(), 1);
    await db.$executeRaw`UPDATE "NotificationDelivery" SET "availableAt" = NOW() WHERE "id" = ${record.id}`;
    await Promise.all([processNotificationDeliveries(), processNotificationDeliveries()]);
    [record] = (await listNotificationDeliveries()).filter((item) => item.leadId === lead.id);
    assert.equal(record.status, 'DELIVERED');
    assert.equal(record.attempts, 2);
    await processNotificationDeliveries();
    assert.equal(delivery.mock.callCount(), 2);

    const { lead: uncertain } = await createOrFindLead({ businessName: 'Uncertain delivery fixture', country: 'India' });
    await db.$transaction((tx) => queueLeadDeliveries(tx, uncertain.id, prefs));
    await db.$executeRaw`UPDATE "NotificationDelivery" SET "status" = 'SENDING', "leaseUntil" = NOW() - INTERVAL '1 second' WHERE "leadId" = ${uncertain.id}`;
    await processNotificationDeliveries();
    const result = (await listNotificationDeliveries()).find((item) => item.leadId === uncertain.id);
    assert.equal(result?.status, 'FAILED');
    assert.equal(delivery.mock.callCount(), 2);

    const { lead: exhausted } = await createOrFindLead({ businessName: 'Exhausted delivery fixture', country: 'India' });
    await db.$transaction((tx) => queueLeadDeliveries(tx, exhausted.id, prefs));
    delivery.mock.mockImplementation(async () => ({ status: 'RETRYING' as const, reason: 'Temporary response' }));
    for (let attempt = 1; attempt <= 3; attempt++) {
      await db.$executeRaw`UPDATE "NotificationDelivery" SET "availableAt" = NOW() WHERE "leadId" = ${exhausted.id}`;
      await processNotificationDeliveries();
      const item = (await listNotificationDeliveries()).find((entry) => entry.leadId === exhausted.id);
      assert.equal(item?.status, attempt === 3 ? 'FAILED' : 'RETRYING');
      assert.equal(item?.attempts, attempt);
    }
    await processNotificationDeliveries();
    assert.equal(delivery.mock.callCount(), 5);
  });
});
