import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import axios from 'axios';
import type { Lead, PrismaClient } from '@prisma/client';
import { parseCsv } from '../utils/csv';

const databaseUrl = process.env.PHASE19_TEST_DATABASE_URL ?? process.env.PHASE18_TEST_DATABASE_URL;
const testSecret = 'phase18-workspace-integration-test-only';

describe('Lead conversion with PostgreSQL and the HTTP API', { skip: !databaseUrl }, () => {
  let db: PrismaClient;
  let server: Server;
  let base: string;
  let lead: Lead;
  let otherLead: Lead;
  let publish: typeof import('../services/followUpReminders').publishFollowUpReminders;

  async function request(path: string, expected: number, method = 'GET', body?: object, authenticated = true) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(authenticated ? { Authorization: `Bearer ${testSecret}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json() as { data?: any };
    assert.equal(response.status, expected, JSON.stringify(json));
    return json.data;
  }

  before(async () => {
    assert.match(new URL(databaseUrl!).pathname, /^\/(?:phase18_sales_|phase19_engagement_)[a-z0-9_]+$/);
    process.env.DATABASE_URL = databaseUrl!;
    process.env.API_SECRET = testSecret;
    process.env.GEMINI_API_KEY = ' ';
    process.env.DISCOVERY_EXTERNAL_ALERTS_ENABLED = 'false';
    const database = await import('../db/prisma');
    db = database.prisma;
    assert.equal(await database.initDatabaseConnection(), true);
    assert.equal(await db.lead.count(), 0, 'Use a fresh, disposable database.');
    lead = await db.lead.create({ data: {
      businessName: 'Conversion integration fixture', country: 'India', city: 'Hyderabad',
      leadStatus: 'Qualified', qualificationStatus: 'QUALIFIED', website: 'https://example.com', businessEmail: 'client@example.com',
    } });
    otherLead = await db.lead.create({ data: { businessName: 'Closed fixture', leadStatus: 'Lost' } });
    const { authenticate } = await import('../middleware/auth');
    const { errorHandler } = await import('../middleware/errorHandler');
    const app = express();
    app.use(authenticate, express.json());
    app.use((req, _res, next) => {
      if (req.user && req.get('X-Test-Reader') === 'true') req.user.role = 'user';
      next();
    });
    app.use('/pitches', (await import('../routes/pitches')).default);
    app.use('/leads', (await import('../routes/leads')).default);
    app.use('/ratecards', (await import('../routes/ratecards')).default);
    app.use('/analytics', (await import('../routes/analytics')).default);
    app.use('/follow-ups', (await import('../routes/followups')).default);
    app.use('/engagement', (await import('../routes/engagement')).default);
    app.use(errorHandler);
    publish = (await import('../services/followUpReminders')).publishFollowUpReminders;
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db?.$disconnect();
  });

  async function setPolicy(leadId: string, scope: string, status: string) {
    const state = await request(`/engagement/leads/${leadId}`, 200);
    const policy = state.policies.find((item: { scope: string }) => item.scope === scope);
    return request(`/engagement/leads/${leadId}/policy`, 200, 'PUT', {
      scope, status, version: policy.version, evidence: 'Controlled fixture attestation.',
    });
  }

  const mark = (pitch: { id: string; updatedAt: string }, expected = 200) =>
    request(`/pitches/${pitch.id}/mark-sent`, expected, 'POST', {
      updatedAt: pitch.updatedAt, confirmed: true, occurredAt: new Date().toISOString(),
    });

  it('protects follow-ups, proposals and approvals with the existing workspace authentication', async () => {
    await request('/follow-ups', 401, 'GET', undefined, false);
    await request('/ratecards/proposals', 401, 'POST', {}, false);
    await request('/pitches/unknown/approve', 401, 'POST', {}, false);
    await request('/engagement/campaigns', 401, 'GET', undefined, false);
    await request('/engagement/leads/unknown/policy', 401, 'PUT', {}, false);
  });

  it('uses stored lead details and labels fallback, invalidates stale approval, and records manual delivery once', async () => {
    const pitch = await request('/pitches/generate', 201, 'POST', {
      leadId: lead.id, companyName: 'Unverified override', targetService: 'Business website',
      verifiedProblems: ['Unmeasured claim'],
    });
    assert.equal(pitch.metadata.generatedBy, 'evidence_fallback');
    assert.equal(pitch.metadata.isFallback, true);
    assert.equal(pitch.metadata.model, null);
    assert.doesNotMatch(pitch.body, /Unverified override|Unmeasured claim/);
    assert.equal(pitch.lead.leadStatus, 'Ready_to_Contact');
    assert.equal(pitch.sentAt, null);
    await mark(pitch, 409);
    await request(`/pitches/${pitch.id}/approve`, 409, 'POST', { updatedAt: pitch.updatedAt });
    await setPolicy(lead.id, 'COLD_EMAIL', 'GRANTED');
    await request(`/pitches/${pitch.id}`, 409, 'PUT', { status: 'REPLIED' });
    const approved = await request(`/pitches/${pitch.id}/approve`, 200, 'POST', { updatedAt: pitch.updatedAt });
    assert.ok(approved.approvedAt);
    const edited = await request(`/pitches/${pitch.id}`, 200, 'PUT', { body: 'Revised draft text', updatedAt: approved.updatedAt });
    assert.equal(edited.approvedAt, null);
    await request(`/pitches/${pitch.id}/approve`, 409, 'POST', { updatedAt: pitch.updatedAt });
    const reapproved = await request(`/pitches/${pitch.id}/approve`, 200, 'POST', { updatedAt: edited.updatedAt });
    const deliveries = await Promise.all([mark(reapproved), mark(reapproved)]);
    assert.equal(deliveries[0].sentAt, deliveries[1].sentAt);
    assert.equal(deliveries[0].lead.leadStatus, 'Contacted');
    assert.equal(await db.activityLog.count({ where: { action: 'OUTREACH_SENT', metadata: { path: ['pitchId'], equals: pitch.id } } }), 1);
    await request(`/pitches/${pitch.id}`, 409, 'PUT', { status: 'REPLIED' });
    const replied = await request(`/engagement/leads/${lead.id}/responses`, 200, 'POST', {
      pitchId: pitch.id, kind: 'QUESTION', summary: 'Asked about project lead time.', occurredAt: new Date().toISOString(),
    });
    assert.equal(replied.pitch.status, 'REPLIED');
    assert.equal((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).leadStatus, 'Replied');
    assert.equal(await db.notificationDelivery.count(), 0);
  });

  it('stores a catalog quote, rejects overrides, and ties a recorded win to the lead and analytics', async () => {
    const catalog = await request('/ratecards', 200);
    const service = catalog[0];
    const selection = { serviceKey: service.serviceKey, tier: service.tier };
    const payload = { leadId: lead.id, currency: 'INR', services: [selection] };
    await request('/ratecards/proposals', 400, 'POST', { ...payload, services: [{ ...selection, priceInr: 1 }] });
    await request('/ratecards/proposals', 400, 'POST', { ...payload, services: [selection, selection] });
    await request('/ratecards/proposals', 404, 'POST', { ...payload, leadId: 'missing' });
    const saved = await request('/ratecards/proposals', 201, 'POST', payload);
    assert.equal(saved.proposal.totalMinor, Math.round(service.priceInr * 100));
    assert.equal(saved.proposal.customer.businessName, lead.businessName);
    assert.equal(saved.proposal.lines[0].packageId, service.id);
    assert.equal(saved.metadata.generatedBy, 'SERVICE_CATALOG');
    await request(`/pitches/${saved.id}`, 409, 'PUT', { body: 'alter the saved quote' });
    await setPolicy(lead.id, 'UPWORK_PROPOSAL', 'GRANTED');
    const approved = await request(`/pitches/${saved.id}/approve`, 200, 'POST', { updatedAt: saved.updatedAt });
    await mark(approved);
    const won = await request(`/pitches/${saved.id}`, 200, 'PUT', { status: 'CONVERTED' });
    assert.equal(won.lead.leadStatus, 'Won');
    assert.equal(won.proposal.totalMinor, saved.proposal.totalMinor);
    const history = await request(`/leads/${lead.id}`, 200);
    assert.ok(history.activityHistory.some((event: { description: string }) => event.description.includes('to Won')));
    const analytics = await request('/analytics', 200);
    assert.equal(analytics.summary.winRatePercentage, 50);
    assert.equal(analytics.salesPerformance.proposals.accepted, 1);
    assert.equal(analytics.salesPerformance.proposals.totals[0].acceptedMinor, saved.proposal.totalMinor);
    assert.equal(analytics.outreachMetrics.sent, 1);
  });

  it('validates links and times, survives a reconnection and claims a due reminder once across workers', async () => {
    const dueAt = new Date(Date.now() + 60_000).toISOString();
    const [pitch] = await db.pitch.findMany({ where: { leadId: lead.id }, take: 1 });
    const input = { leadId: lead.id, pitchId: pitch.id, title: 'Review proposal with the lead', dueAt };
    await request('/follow-ups', 400, 'POST', { ...input, leadId: otherLead.id });
    await request('/follow-ups', 400, 'POST', { ...input, dueAt: '2000-01-01T00:00:00Z' });
    const followUp = await request('/follow-ups', 201, 'POST', input);
    assert.equal(followUp.dueAt, dueAt);
    await db.$disconnect();
    await db.$connect();
    const list = await request(`/follow-ups?leadId=${lead.id}`, 200);
    assert.equal(list[0].id, followUp.id);
    assert.equal(await publish(new Date()), 0);
    const due = new Date(Date.parse(dueAt) + 100);
    const claims = await Promise.all([publish(due), publish(due)]);
    assert.equal(claims[0] + claims[1], 1);
    const findNotification = { type: 'FOLLOW_UP_DUE', leadId: lead.id };
    assert.equal(await db.notification.count({ where: findNotification }), 1);
    const later = new Date(Date.now() + 120_000);
    const changed = await request(`/follow-ups/${followUp.id}`, 200, 'PATCH', { revision: followUp.revision, dueAt: later.toISOString() });
    assert.equal(changed.remindedAt, null);
    await request(`/follow-ups/${followUp.id}`, 409, 'PATCH', { revision: followUp.revision, status: 'COMPLETED' });
    assert.equal(await publish(new Date(later.getTime() + 100)), 1);
    await request(`/follow-ups/${followUp.id}`, 200, 'PATCH', { revision: changed.revision, status: 'COMPLETED' });
    assert.equal(await db.notification.count({ where: { ...findNotification, read: false } }), 0);
    assert.equal(await db.notificationDelivery.count(), 0);
    const analytics = await request('/analytics', 200);
    assert.equal(analytics.salesPerformance.followUps.completed, 1);
  });

  it('segments a campaign, deduplicates concurrent WhatsApp drafts, and rechecks changed recipients', async () => {
    const target = await db.lead.create({ data: {
      businessName: 'Consent fixture', city: 'Hyderabad', country: 'India', industry: 'Travel', opportunityScore: 85,
      leadStatus: 'Qualified', qualificationStatus: 'QUALIFIED', publicBusinessPhone: '+91 90000 00001',
    } });
    const excluded = await db.lead.create({ data: {
      businessName: 'Outside segment fixture', city: 'Pune', country: 'India', industry: 'Travel', opportunityScore: 90,
      leadStatus: 'Qualified', publicBusinessPhone: '+91 90000 00002',
    } });
    const campaign = await request('/engagement/campaigns', 201, 'POST', {
      name: 'Travel campaign fixture', channel: 'WHATSAPP',
      criteria: { country: 'india', city: 'hyderabad', industry: 'Travel', minimumScore: 80, qualifiedOnly: true },
    });
    const initial = await request(`/engagement/campaigns/${campaign.id}/segment`, 200);
    assert.deepEqual(initial.rows.map((row: { id: string; reason: string }) => [row.id, row.reason]), [[target.id, 'CONSENT_REQUIRED']]);
    const payload = { leadId: target.id, campaignId: campaign.id, companyName: 'Override ignored', messageType: 'WHATSAPP_MESSAGE',
      targetService: 'Business website' };
    await request('/pitches/generate', 409, 'POST', payload);
    await request('/pitches/generate', 409, 'POST', { ...payload, leadId: excluded.id });
    const policy = await setPolicy(target.id, 'WHATSAPP', 'GRANTED');
    const concurrently = await Promise.all(Array.from({ length: 3 }, () => Promise.resolve().then(async () => {
      const response = await fetch(base + '/pitches/generate', {
        method: 'POST', headers: { Authorization: `Bearer ${testSecret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.ok(response.status === 200 || response.status === 201, await response.clone().text());
      return (await response.json() as { data: { id: string; status: string; body: string; metadata: { generatedBy: string } } }).data;
    })));
    assert.equal(new Set(concurrently.map((entry) => entry.id)).size, 1);
    const draft = await request('/pitches/' + concurrently[0].id, 200);
    assert.match(draft.body, /Consent fixture/);
    assert.doesNotMatch(draft.body, /Override ignored/);
    assert.equal(draft.metadata.generatedBy, 'evidence_fallback');
    assert.equal(draft.status, 'DRAFT');
    const approved = await request(`/pitches/${draft.id}/approve`, 200, 'POST', { updatedAt: draft.updatedAt });
    await db.lead.update({ where: { id: target.id }, data: { publicBusinessPhone: '+91 90000 00003' } });
    await request(`/engagement/leads/${target.id}/policy`, 409, 'PUT', {
      scope: 'WHATSAPP', status: 'GRANTED', evidence: 'Stale original recipient reference.', version: policy.version,
    });
    assert.equal((await request(`/pitches/${draft.id}/eligibility`, 200)).reason, 'CONSENT_REQUIRED');
    await mark(approved, 409);
    await setPolicy(target.id, 'WHATSAPP', 'GRANTED');
    assert.equal((await request(`/pitches/${draft.id}/eligibility`, 200)).approved, false);
    await setPolicy(target.id, 'ALL', 'SUPPRESSED');
    assert.equal((await request(`/pitches/${draft.id}/eligibility`, 200)).reason, 'SUPPRESSED');
    await setPolicy(target.id, 'ALL', 'CLEARED');
    const reapproved = await request(`/pitches/${draft.id}/approve`, 200, 'POST', { updatedAt: approved.updatedAt });
    const sent = await mark(reapproved);
    assert.equal(sent.status, 'SENT');
    const before = await request('/analytics', 200);
    assert.equal(before.engagementPerformance.campaigns.find((item: { id: string }) => item.id === campaign.id).replied, 0);
    assert.equal((await request(`/engagement/leads/${target.id}`, 200)).recommendation.kind, 'REVIEW_FOLLOW_UP');

    const reply = { pitchId: draft.id, occurredAt: new Date().toISOString(), kind: 'BUDGET', summary: 'Client says their budget is already allocated.' };
    await request(`/engagement/leads/${excluded.id}/responses`, 404, 'POST', reply);
    await request(`/engagement/leads/${target.id}/responses`, 400, 'POST', { ...reply, occurredAt: '2099-01-01T00:00:00Z' });
    await Promise.all([
      request(`/engagement/leads/${target.id}/responses`, 200, 'POST', reply),
      request(`/engagement/leads/${target.id}/responses`, 200, 'POST', reply),
    ]);
    const contacts = await request(`/engagement/leads/${target.id}`, 200);
    assert.equal(contacts.timeline.filter((item: { kind: string }) => item.kind === 'BUDGET').length, 1);
    assert.equal(contacts.recommendation.kind, 'REVIEW_REPLY');
    const after = await request('/analytics', 200);
    assert.equal(after.engagementPerformance.campaigns.find((item: { id: string }) => item.id === campaign.id).replied, 1);
    assert.deepEqual(after.engagementPerformance.objections, [{ kind: 'BUDGET', count: 1 }]);

    const duplicate = await db.pitch.create({ data: {
      leadId: target.id, channel: 'WHATSAPP', subject: 'Ignored subject for WhatsApp', targetService: draft.targetService,
      messageType: 'WHATSAPP_MESSAGE', body: draft.body.replace(/\n+/g, ' '),
    } });
    const duplicateApproved = await request(`/pitches/${duplicate.id}/approve`, 200, 'POST', { updatedAt: duplicate.updatedAt.toISOString() });
    await mark(duplicateApproved, 409);
    await request(`/engagement/leads/${target.id}/responses`, 200, 'POST', {
      ...reply, kind: 'OPT_OUT', summary: 'Client requested no further WhatsApp messages.', occurredAt: new Date().toISOString(),
    });
    assert.equal((await request(`/pitches/${duplicate.id}/eligibility`, 200)).reason, 'OPTED_OUT');
    assert.equal((await request(`/engagement/leads/${target.id}`, 200)).recommendation.kind, 'HOLD');
    await mark(duplicateApproved, 409);
    assert.equal(await db.notificationDelivery.count(), 0);
  });

  it('enforces recipient-wide opt-out across leads and retains suppression after a lead is removed', async () => {
    const contact = 'shared@example.org';
    const [first, second] = await Promise.all(['Originating fixture', 'Shared recipient fixture'].map((businessName) =>
      db.lead.create({ data: { businessName, businessEmail: contact } })));
    await setPolicy(second.id, 'COLD_EMAIL', 'GRANTED');
    await setPolicy(first.id, 'COLD_EMAIL', 'OPTED_OUT');
    const state = await request(`/engagement/leads/${second.id}`, 200);
    assert.equal(state.policies.find((item: { scope: string }) => item.scope === 'COLD_EMAIL').reason, 'OPTED_OUT');
    await db.lead.delete({ where: { id: first.id } });
    const suppressed = await request(`/engagement/leads/${second.id}`, 200);
    assert.equal(suppressed.policies.find((item: { scope: string }) => item.scope === 'COLD_EMAIL').reason, 'OPTED_OUT');
  });

  it('serves protected, date-filtered business metrics with no customer fields', async () => {
    await request('/analytics/business-growth', 401, 'GET', undefined, false);
    await request('/analytics/business-growth?range=custom&from=2024-08-21&to=2024-08-20', 400);
    await request('/analytics/business-growth?range=last7&range=last30', 400);
    const within = new Date('2024-08-19T18:30:00.000Z');
    const later = new Date('2024-08-20T18:30:00.000Z');
    const selected = await db.lead.create({ data: {
      businessName: 'Private business integration fixture', businessEmail: 'private-growth@example.com',
      createdAt: within, leadStatus: 'Qualified', qualificationStatus: 'QUALIFIED',
      discoverySources: { create: [
        { providerId: 'google_places', reference: 'fixture-source-a', firstDiscoveredAt: within, lastDiscoveredAt: within },
        { providerId: 'serpapi', reference: 'fixture-source-b', firstDiscoveredAt: within, lastDiscoveredAt: within },
      ] },
    } });
    await db.lead.create({ data: { businessName: 'Outside the selected day', createdAt: later } });
    const followUp = await db.leadFollowUp.create({ data: {
      leadId: selected.id, title: 'Private reminder fixture', dueAt: within, status: 'COMPLETED',
    } });
    await db.activityLog.createMany({ data: [
      { action: 'STATUS_CHANGED', description: 'Private stage note', createdAt: within,
        metadata: { leadId: selected.id, from: 'Negotiation', to: 'Won' } },
      { action: 'FOLLOW_UP_COMPLETED', description: 'Private follow-up note', createdAt: within,
        metadata: { leadId: selected.id, followUpId: followUp.id } },
      { action: 'STATUS_CHANGED', description: 'Unlinked fixture', createdAt: within,
        metadata: { leadId: 'missing', from: 'Contacted', to: 'Lost' } },
    ] });
    await db.pitch.createMany({ data: [
      { leadId: selected.id, targetService: 'Website', body: 'Private quote text', createdAt: within,
        proposal: { currency: 'INR', totalMinor: 500_012 } },
      { leadId: selected.id, targetService: 'Website', body: 'Private quote text', createdAt: within,
        proposal: { currency: 'USD', totalMinor: 48_050 } },
      { leadId: selected.id, targetService: 'Website', body: 'Plain outreach record', createdAt: within },
    ] });

    const growth = await request('/analytics/business-growth?range=custom&from=2024-08-20&to=2024-08-20', 200);
    assert.equal(growth.coverage.totalLeads, 1);
    assert.equal(growth.coverage.providerLeads, 1);
    assert.equal(growth.coverage.closedDeals, 1);
    assert.equal(growth.timeline[0].followUpsCompleted, 1);
    assert.equal(growth.timeline[0].proposalsCreated, 2);
    assert.deepEqual(growth.quoteValues, [
      { currency: 'INR', totalMinor: '500012', quotes: 1 },
      { currency: 'USD', totalMinor: '48050', quotes: 1 },
    ]);
    assert.equal(growth.actualRevenue.status, 'unavailable');
    assert(growth.kpis.every((metric: { comparison: unknown }) => metric.comparison === null));
    assert.doesNotMatch(JSON.stringify(growth), /Private|private-growth|fixture-source|businessEmail|leadId/);
    const history = await request('/analytics?view=summary', 200);
    assert.deepEqual(history.recentLeads, []);
    assert.deepEqual(history.topOpportunities, []);
    assert(history.recentActivity.every((item: { metadata?: unknown }) => item.metadata === undefined));
    assert.doesNotMatch(JSON.stringify(history), /Private|private-growth|fixture-source|businessEmail|leadId/);
    const empty = await request('/analytics/business-growth?range=custom&from=2024-08-22&to=2024-08-22', 200);
    assert.equal(empty.coverage.totalLeads, 0);
    assert.deepEqual(empty.quoteValues, []);
  });

  it('keeps all-time analytics projections private and excludes unmatched or mistimed engagement', async () => {
    const path = '/analytics?view=summary';
    const before = await request(path, 200);
    const added = await db.lead.create({ data: {
      businessName: 'Analytics projection fixture', country: 'constructor', notes: 'private-proof-note',
      businessEmail: 'private-proof@example.com', website: 'https://private-proof.example.com',
    } });
    const sentAt = new Date('2024-06-10T06:00:00Z');
    const pitch = await db.pitch.create({ data: {
      leadId: added.id, body: 'private-proof-message', targetService: 'Website', status: 'SENT', sentAt,
    } });
    await db.activityLog.createMany({ data: [
      { leadId: otherLead.id, pitchId: pitch.id, kind: 'BUDGET', occurredAt: '2024-06-11T06:00:00Z' },
      { leadId: added.id, pitchId: pitch.id, kind: 'BUDGET', occurredAt: '2024-06-09T06:00:00Z' },
      { leadId: added.id, pitchId: 'missing', kind: 'OPT_OUT', occurredAt: '2024-06-11T06:00:00Z' },
      { leadId: added.id, pitchId: pitch.id, kind: 'TIMING', occurredAt: '2024-06-12T06:00:00Z' },
    ].map((metadata) => ({
      action: 'COMMUNICATION_RESPONSE', metadata: { ...metadata, summary: 'private-proof-reply' },
      description: 'private-proof-activity',
    })) });
    const full = await request('/analytics', 200);
    const summary = await request(path, 200);
    assert.equal(full.recentLeads[0].businessName, added.businessName);
    for (const result of [full, summary]) {
      assert.doesNotMatch(JSON.stringify(result), /private-proof|businessEmail|metadata/);
      assert(result.regionDistribution.some(({ name, count }: { name: string; count: number }) => name === 'constructor' && count === 1));
      assert.equal(result.outreachMetrics.sent - before.outreachMetrics.sent, 1);
      assert.equal(result.outreachMetrics.replied - before.outreachMetrics.replied, 1);
      const objections = (data: any) => Object.fromEntries(data.engagementPerformance.objections.map(
        ({ kind, count }: { kind: string; count: number }) => [kind, count],
      ));
      assert.deepEqual(objections(result), { ...objections(before), TIMING: (objections(before).TIMING ?? 0) + 1 });
    }
  });

  it('serves protected market intelligence grounded in saved evidence without contact fields', async () => {
    const path = '/analytics/business-growth/intelligence';
    await request(path, 401, 'GET', undefined, false);
    await request(path + '?range=custom&from=2024-09-13&to=2024-09-12', 400);
    await request(path + '?range=last7&limit=10000', 400);
    const time = new Date('2024-09-12T06:00:00Z');
    const reference = 'private-provider-reference';
    const lead = await db.lead.create({ data: {
      businessName: 'Market evidence fixture', businessEmail: 'private-stage2@example.com',
      publicBusinessPhone: '+919000005001', city: 'Hyderabad', country: 'India', industry: 'Travel',
      website: 'https://verified-fixture.example', qualificationScore: 79, qualificationStatus: 'QUALIFIED',
      leadStatus: 'Qualified', createdAt: time,
      discoveryEvidence: { fields: {
        country: { value: 'IN', source: reference }, city: { value: 'Hyderabad', source: reference },
        category: { value: 'Travel', source: reference },
      }, coordinates: { lat: 17.4, lon: 78.5 } },
      discoverySources: { create: [
        { providerId: 'google_places', reference, firstDiscoveredAt: time, lastDiscoveredAt: time },
        { providerId: 'google_places', reference: 'private-duplicate', firstDiscoveredAt: time, lastDiscoveredAt: time },
      ] },
      audits: { create: {
        createdAt: time, websiteUrl: 'https://verified-fixture.example', summary: 'Private audit text',
        rawData: { evidence: { statusCode: 200, finalUrl: 'https://verified-fixture.example', isResponsiveReady: false } },
      } },
    } });
    await db.lead.create({ data: { businessName: 'Unverified destination fixture', industry: 'travel',
      city: 'Private unverified city', country: 'India', createdAt: time } });
    await db.pitch.create({ data: {
      leadId: lead.id, targetService: 'Backend API', body: 'Private proposal body',
      status: 'SENT', sentAt: time, createdAt: time, proposal: { currency: 'USD', totalMinor: 100, lines: [{ serviceKey: 'backend_api' }] },
    } });
    await db.activityLog.create({ data: { action: 'STATUS_CHANGED', description: 'Private stage text', createdAt: time,
      metadata: { leadId: lead.id, from: 'Negotiation', to: 'Won' } } });
    const report = await request(path + '?range=custom&from=2024-09-12&to=2024-09-12', 200);
    assert.equal(report.provenance, 'evidence_fallback');
    assert.equal(report.coverage.leads, 2);
    assert.equal(report.coverage.withProvider, 1);
    assert.equal(report.coverage.verifiedCity, 1);
    assert.equal(report.industries.length, 1);
    assert.equal(report.industries[0].leads, 2);
    assert.equal(report.industries[0].proposals, 1);
    assert.equal(report.industries[0].won, 1);
    assert.equal(report.industries[0].winRate, null);
    assert.equal(report.locations.find((row: { label: string }) => row.label === 'Hyderabad, India').won, null);
    const result = report.recommendations.find((item: { id: string }) => item.id === lead.id);
    assert.equal(result.sourceCount, 1);
    assert(result.services.some((item: { service: string }) => item.service === 'Website redesign and UI/UX'));
    assert(result.services.some((item: { service: string }) => item.service === 'Backend API development'));
    assert.doesNotMatch(JSON.stringify(report), /private-stage2|9000005001|private-provider|verified-fixture\.example|Private |coordinates/);
    const empty = await request(path + '?range=custom&from=2024-09-13&to=2024-09-13', 200);
    assert.deepEqual(empty.recommendations, []);
    assert.deepEqual(empty.industries, []);
  });

  it('generates and preserves authorized report snapshots and exports measured currency values', async () => {
    const path = '/analytics/business-growth/reports';
    const date = { kind: 'weekly', date: '2024-10-16' };
    const apiHeaders = { Authorization: `Bearer ${testSecret}` };
    await request(path, 401, 'GET', undefined, false);
    await request(path, 401, 'POST', date, false);
    const forbidden = await fetch(base + path, { method: 'POST', headers: {
      ...apiHeaders, 'Content-Type': 'application/json', 'X-Test-Reader': 'true',
    }, body: JSON.stringify(date) });
    assert.equal(forbidden.status, 403);
    assert.equal((await request(path, 200)).geminiAvailable, false);
    await request(path, 400, 'POST', { kind: 'weekly', date: '2024-02-31' });
    await request(path + '/00000000-0000-4000-8000-000000000000', 404);

    const current = new Date('2024-10-16T06:00:00Z');
    const prior = new Date('2024-10-09T06:00:00Z');
    const newLead = (name: string, observedAt: Date, references: string[]) => db.lead.create({ data: {
      businessName: name, businessEmail: 'private-stage3@example.com', createdAt: observedAt,
      leadStatus: 'Qualified', qualificationStatus: 'QUALIFIED', industry: '+Travel',
      discoverySources: { create: references.map((reference) => ({
        reference, providerId: 'google_places', firstDiscoveredAt: observedAt, lastDiscoveredAt: observedAt,
      })) },
    } });
    const target = await newLead('Stage 3 report fixture', current, ['report-ref-01', 'report-ref-02']);
    await newLead('Stage 3 comparison fixture', prior, ['report-ref-03']);
    const delivery = await db.pitch.create({ data: { leadId: target.id, targetService: 'Website', body: 'Private Stage 3 pitch',
      createdAt: current, sentAt: current, status: 'SENT', proposal: { currency: 'INR', totalMinor: 500_012 } } });
    await db.pitch.create({ data: { leadId: target.id, targetService: 'Website', body: 'Private Stage 3 pitch',
      createdAt: current, proposal: { currency: 'USD', totalMinor: 48_050 } } });
    await db.pitch.create({ data: { leadId: target.id, targetService: 'Website', body: 'Malformed historical proposal',
      createdAt: current, proposal: {} } });
    await db.activityLog.createMany({ data: ['BUDGET', 'QUESTION'].map((kind) => ({
      action: 'COMMUNICATION_RESPONSE', description: 'Private Stage 3 response notes',
      metadata: { leadId: target.id, pitchId: delivery.id, kind, occurredAt: '2024-10-16T07:00:00Z' },
    })) });

    const weekly = await request(path, 201, 'POST', date);
    assert.equal(weekly.origin, 'deterministic');
    assert.deepEqual([weekly.periodFrom, weekly.periodTo], ['2024-10-14', '2024-10-20']);
    assert.deepEqual(weekly.snapshot.previous, { from: '2024-10-07', to: '2024-10-13' });
    assert.deepEqual(weekly.snapshot.discovered, { value: 1, comparison: { value: 1, delta: 0 } });
    assert.equal(weekly.snapshot.growth.qualification.qualified, 1);
    assert.equal(weekly.snapshot.growth.kpis.find(({ key }: { key: string }) => key === 'proposalsCreated').value, 2);
    assert.equal(weekly.snapshot.market.industries[0].proposals, 2);
    assert.equal(weekly.snapshot.engagement.deliveries.value, 1);
    assert.equal(weekly.snapshot.engagement.replies.value, 1);
    assert.equal(weekly.snapshot.engagement.responses, 2);
    assert.deepEqual(weekly.snapshot.engagement.objections, [{ label: 'Budget', count: 1 }]);
    assert.equal(weekly.snapshot.growth.actualRevenue.status, 'unavailable');
    assert.deepEqual(weekly.snapshot.growth.quoteValues.map((item: { currency: string; totalMinor: string }) => [item.currency, item.totalMinor]),
      [['INR', '500012'], ['USD', '48050']]);
    assert.equal(weekly.snapshot.insights.length, 7);
    assert.doesNotMatch(JSON.stringify(weekly), /private-stage3|report-ref|Private Stage 3|businessEmail|coordinates/);

    const csvUrl = base + path + '/' + weekly.id + '/export.csv';
    assert.equal((await fetch(csvUrl)).status, 401);
    const csv = await fetch(csvUrl, { headers: apiHeaders });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-disposition') ?? '', /weekly-business-report-2024-10-14\.csv/);
    assert.equal(csv.headers.get('cache-control'), 'no-store');
    const body = await csv.text();
    const csvRows = parseCsv(body).map(({ value }) => value);
    assert.deepEqual(csvRows.filter((row) => row.Metric === 'Saved quote face value').map((row) => [row.Value, row.Unit]),
      [['500012', 'INR minor units'], ['48050', 'USD minor units']]);
    assert.equal(csvRows.find((row) => row.Metric === 'Actual revenue')?.Value, 'Unavailable');
    assert(csvRows.some((row) => row.Section === 'Industry' && row.Metric === "'+Travel"));
    assert.doesNotMatch(body, /Private Stage 3|private-stage3|report-ref/);

    const insightsPath = path + '/' + weekly.id + '/insights';
    assert.equal((await fetch(base + insightsPath, { method: 'POST', headers: { ...apiHeaders, 'X-Test-Reader': 'true' } })).status, 403);
    const fallback = await request(insightsPath, 200, 'POST');
    assert.equal(fallback.status, 'unavailable');
    assert.deepEqual(fallback.report, weekly);
    assert.equal(await db.businessReport.count({ where: { sourceReportId: weekly.id } }), 0);
    await assert.rejects(db.businessReport.update({ where: { id: weekly.id }, data: { origin: 'gemini' } }), /immutable/i);
    await assert.rejects(db.businessReport.delete({ where: { id: weekly.id } }), /immutable/i);

    await newLead('Later report fixture entry', current, ['report-ref-04']);
    const regenerated = await request(path, 201, 'POST', date);
    assert.notEqual(regenerated.id, weekly.id);
    assert.equal(regenerated.snapshot.discovered.value, 2);
    assert.deepEqual(await request(path + '/' + weekly.id, 200), weekly);
    const monthly = await request(path, 201, 'POST', { kind: 'monthly', date: '2024-10-16' });
    assert.deepEqual([monthly.periodFrom, monthly.periodTo], ['2024-10-01', '2024-10-31']);
    assert.equal(monthly.snapshot.discovered.value, 3);
    const empty = await request(path, 201, 'POST', { kind: 'monthly', date: '2024-02-15' });
    assert(empty.snapshot.growth.kpis.every((metric: { value: number; comparison: unknown }) => metric.value === 0 && metric.comparison === null));
    assert.deepEqual(empty.snapshot.review, []);
    assert.equal(empty.snapshot.growth.actualRevenue.status, 'unavailable');
    assert.deepEqual((await request(path, 200)).records.map((row: { id: string }) => row.id), [empty.id, monthly.id, regenerated.id, weekly.id]);
    await db.businessReport.createMany({ data: Array.from({ length: 48 }, () => ({
      kind: empty.kind, timezone: empty.timezone, periodFrom: empty.periodFrom, periodTo: empty.periodTo,
      origin: empty.origin, snapshot: empty.snapshot, createdAt: new Date('2025-01-01T00:00:00Z'),
    })) });
    const firstPage = await request(path, 200);
    assert.equal(firstPage.records.length, 50);
    assert.equal(firstPage.nextCursor, firstPage.records[49].id);
    const lastPage = await request(path + '?after=' + firstPage.nextCursor, 200);
    assert.equal(lastPage.records.length, 2);
    assert.equal(lastPage.nextCursor, null);
    assert.equal(new Set([...firstPage.records, ...lastPage.records].map(({ id }) => id)).size, 52);
    await request(path + '?after=invalid', 400);
  });

  it('coalesces report interpretations and keeps measured history immutable under cooldown and uniqueness', async (context) => {
    const path = '/analytics/business-growth/reports';
    const selection = { kind: 'weekly', date: '2024-10-16' };
    const first = await request(path, 201, 'POST', selection);
    const second = await request(path, 201, 'POST', selection);
    const { config } = await import('../config');
    const original = { NODE_ENV: config.NODE_ENV, GEMINI_API_KEY: config.GEMINI_API_KEY };
    const choices = { insights: first.snapshot.insights.map(({ id }: { id: string }) => ({ id, emphasis: 'coverage' })).reverse() };
    const blockedHttps = context.mock.method(https, 'request', () => { throw new Error('Outbound HTTPS is disabled in this test.'); });
    const stub = context.mock.method(axios, 'post', async (_url: string, body: unknown) => {
      assert.doesNotMatch(JSON.stringify(body), /private-stage3|report-ref|businessEmail/);
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(choices) }] } }] } };
    });
    type Interpretation = { report: { id: string; origin: string; sourceReportId: string; snapshot: typeof first.snapshot } };
    let interpreted: Interpretation['report'];
    try {
      config.NODE_ENV = 'production';
      config.GEMINI_API_KEY = 'fixture-only';
      const calls = Array.from({ length: 4 }, async () => {
        const response = await fetch(base + path + '/' + first.id + '/insights', {
          method: 'POST', headers: { Authorization: `Bearer ${testSecret}` },
        });
        assert([200, 201].includes(response.status));
        const payload = await response.json() as { data: Interpretation };
        return payload.data;
      });
      const outcomes = await Promise.all(calls);
      interpreted = outcomes[0].report;
      assert(outcomes.every((outcome) => outcome.report.id === interpreted.id));
      assert.equal(stub.mock.callCount(), 1);
      assert.equal((await request(path + '/' + second.id + '/insights', 200, 'POST')).status, 'cooldown');
      assert.equal((await request(path + '/' + first.id + '/insights', 200, 'POST')).status, 'already_saved');
      assert.equal(stub.mock.callCount(), 1);
      assert.equal(blockedHttps.mock.callCount(), 0);
    } finally {
      Object.assign(config, original);
    }
    assert.equal(interpreted.origin, 'gemini');
    assert.equal(interpreted.sourceReportId, first.id);
    assert.deepEqual(interpreted.snapshot.growth, first.snapshot.growth);
    assert.deepEqual(await request(path + '/' + first.id, 200), first);
    await assert.rejects(db.businessReport.create({ data: {
      kind: first.kind, timezone: first.timezone, periodFrom: first.periodFrom, periodTo: first.periodTo,
      origin: 'gemini', sourceReportId: first.id, snapshot: interpreted.snapshot,
    } }), { code: 'P2002' });
  });

  it('requires the business report migration for database readiness', async () => {
    const { initDatabaseConnection } = await import('../db/prisma');
    await db.$executeRaw`ALTER TABLE "BusinessReport" RENAME TO "BusinessReport_stage4_fixture"`;
    try {
      assert.equal(await initDatabaseConnection(), false);
    } finally {
      await db.$executeRaw`ALTER TABLE "BusinessReport_stage4_fixture" RENAME TO "BusinessReport"`;
    }
    assert.equal(await initDatabaseConnection(), true);
  });
});
