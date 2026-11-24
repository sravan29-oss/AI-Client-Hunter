import assert from 'node:assert/strict';
import { test } from 'node:test';
import { businessGrowthPeriods, businessRangeSchema } from '../services/businessGrowthCalendar';
import { summarizeBusinessGrowth, type BusinessGrowthRows } from '../services/businessGrowth';

const now = new Date('2026-11-24T09:00:00Z');
const ist = 'Asia/Kolkata';
const select = (input: object = {}) => businessRangeSchema.parse(input);
const fixed = () => businessGrowthPeriods(select({ range: 'custom', from: '2026-11-20', to: '2026-11-23' }), ist, now);

test('rejects invalid, oversized, reversed, future, and conflicting date filters', () => {
  for (const input of [
    { range: 'all' }, { range: ['last7', 'last90'] }, { range: 'last7', from: '2026-11-20' },
    { range: 'custom', from: '2026-02-30', to: '2026-03-01' }, { range: 'custom', from: '2026-11-23' },
    { unknown: 'value' },
  ]) assert.throws(() => select(input));
  for (const [from, to] of [['2026-11-22', '2026-11-20'], ['2026-11-22', '2026-11-25'], ['2023-11-22', '2026-11-25']]) {
    assert.throws(() => businessGrowthPeriods(select({ range: 'custom', from, to }), ist, now), /366 days/);
  }
});

test('resolves exact local boundaries, preceding ranges, and equivalent partial days', () => {
  const seven = businessGrowthPeriods(select({ range: 'last7' }), ist, now);
  assert.equal(seven.current.from, '2026-11-18');
  assert.equal(seven.current.start.toISOString(), '2026-11-17T18:30:00.000Z');
  assert.equal(seven.current.end.toISOString(), now.toISOString());
  assert.deepEqual([seven.previous.from, seven.previous.to], ['2026-11-11', '2026-11-17']);
  assert.equal(seven.previous.end.toISOString(), '2026-11-17T09:00:00.000Z');
  assert.equal(businessGrowthPeriods(select({ range: 'last90' }), ist, now).current.from, '2026-08-27');
  assert.equal(businessGrowthPeriods(select(), ist, now).current.from, '2026-10-26');
  const currentMonth = businessGrowthPeriods(select({ range: 'thisMonth' }), ist, now);
  assert.deepEqual([currentMonth.previous.from, currentMonth.previous.to], ['2026-10-01', '2026-10-24']);
  const previousMonth = businessGrowthPeriods(select({ range: 'previousMonth' }), ist, now);
  assert.deepEqual([previousMonth.current.from, previousMonth.current.to], ['2026-10-01', '2026-10-31']);
  assert.deepEqual([previousMonth.previous.from, previousMonth.previous.to], ['2026-09-01', '2026-09-30']);
  assert.equal(previousMonth.partialToday, false);
  const endOfMarch = businessGrowthPeriods(select({ range: 'thisMonth' }), ist, new Date('2026-03-31T11:00:00Z'));
  assert.equal(endOfMarch.comparable, false);
  const sunday = businessGrowthPeriods(select({ range: 'custom', from: '2026-03-08', to: '2026-03-08' }),
    'America/New_York', now);
  assert.equal(sunday.current.end.getTime() - sunday.current.start.getTime(), 23 * 3_600_000);
});

test('counts selected CRM, proposal, and follow-up records by their own timestamp and keeps separate currency totals', () => {
  const { current, previous } = fixed();
  const within = new Date('2026-11-21T01:00:00Z');
  const old = new Date('2026-11-17T03:00:00Z');
  const row = (createdAt: Date, stage: string, hasProvider = false) => ({
    createdAt, stage, hasProvider, qualificationStatus: null, assessedScore: false,
  });
  const quote = (createdAt: Date, currency: string, totalMinor: unknown, sentAt: Date | null = null) => ({
    createdAt, currency, totalMinor, sentAt,
  });
  const event = (id: string, key: string, createdAt: Date, from: string | null, to: string | null,
    action = 'STATUS_CHANGED') => ({ id, key, action, createdAt, from, to });
  const rows: BusinessGrowthRows = {
    leads: [row(current.start, 'Qualified', true), row(within, 'Ready_to_Contact'), row(current.end, 'New'), row(old, 'Qualified')],
    proposals: [
      quote(within, 'INR', 12_345), quote(within, 'INR', 3_000), quote(within, 'USD', 789),
      quote(within, 'USD', '900'), quote(old, 'INR', 999, within),
    ],
    followUps: [
      { dueAt: within, status: 'PENDING' }, { dueAt: within, status: 'COMPLETED' },
      { dueAt: current.end, status: 'PENDING' },
    ],
    outcomes: [
      event('w1', 'win', within, 'Negotiation', 'Won'),
      event('l1', 'loss', within, 'Contacted', 'Lost'),
      event('r1', 'reopened', within, 'New', 'Won'),
      event('r2', 'reopened', new Date(within.getTime() + 1000), 'Won', 'Negotiation'),
      event('p1', 'older', previous.start, 'Negotiation', 'Lost'),
      event('x1', 'invalid', within, 'Something', 'Won'),
      event('f1', 'follow', within, null, null, 'FOLLOW_UP_COMPLETED'),
      event('f2', 'follow', within, null, null, 'FOLLOW_UP_COMPLETED'),
    ],
  };
  const report = summarizeBusinessGrowth(rows, fixed(), now);
  assert.deepEqual(Object.fromEntries(report.kpis.map(({ key, value }) => [key, value])), {
    totalLeads: 2, qualifiedLeads: 1, activeOpportunities: 2, proposalsCreated: 4,
    wonDeals: 1, lostDeals: 1, followUpsDue: 1, completedFollowUps: 1,
  });
  assert.deepEqual(report.kpis.find(({ key }) => key === 'totalLeads')?.comparison, { value: 1, delta: 1 });
  assert.deepEqual(report.kpis.find(({ key }) => key === 'wonDeals')?.comparison, { value: 0, delta: 1 });
  assert.equal(report.kpis.find(({ key }) => key === 'completedFollowUps')?.comparison, null);
  assert.deepEqual(report.quoteValues, [
    { currency: 'INR', totalMinor: '15345', quotes: 2 },
    { currency: 'USD', totalMinor: '789', quotes: 1 },
  ]);
  assert.equal(report.excludedQuoteAmounts, 1);
  assert.equal(report.coverage.providerLeads, 1);
  assert.equal(report.timeline.reduce((sum, point) => sum + point.proposalsDelivered, 0), 1);
  assert.deepEqual(report.actualRevenue, { status: 'unavailable' });
});

test('represents empty records and unavailable payments without fabricated comparisons or currency amounts', () => {
  const report = summarizeBusinessGrowth({ leads: [], proposals: [], followUps: [], outcomes: [] }, fixed(), now);
  assert(report.kpis.every(({ value, comparison }) => value === 0 && comparison === null));
  assert.equal(report.coverage.paymentRecords, null);
  assert.equal(report.coverage.closedDeals, 0);
  assert.deepEqual(report.quoteValues, []);
  assert.deepEqual(report.statusDistribution, []);
  assert.deepEqual(report.actualRevenue, { status: 'unavailable' });
});
