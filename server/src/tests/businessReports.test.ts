import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shapeReportInterpretation } from '../services/businessReportAi';
import { businessReportPeriods, businessReportRequest } from '../services/businessReportCalendar';
import type { ReportInsight } from '../services/businessReports';

test('weekly reports use Monday through Sunday and compare equivalent partial days', () => {
  const now = new Date('2026-11-23T19:00:00Z');
  const current = businessReportPeriods({ kind: 'weekly' }, 'Asia/Kolkata', now);
  assert.equal(current.today, '2026-11-24');
  assert.equal(current.current.from, '2026-11-23');
  assert.equal(current.current.to, '2026-11-24');
  assert.equal(current.current.start.toISOString(), '2026-11-22T18:30:00.000Z');
  assert.equal(current.current.end, now);
  assert.equal(current.previous.to, '2026-11-17');
  assert.equal(current.previous.end.toISOString(), '2026-11-16T19:00:00.000Z');

  const historical = businessReportPeriods({ kind: 'weekly', date: '2026-11-22' }, 'Asia/Kolkata', now);
  assert.equal(historical.current.from, '2026-11-16');
  assert.equal(historical.current.to, '2026-11-22');
  assert.equal(historical.current.end.toISOString(), '2026-11-22T18:30:00.000Z');
  assert.equal(historical.partialToday, false);
});

test('monthly reports include leap day and suppress a partial comparison beyond the prior month', () => {
  const february = businessReportPeriods({ kind: 'monthly', date: '2024-02-29' }, 'UTC', new Date('2024-03-31T12:00:00Z'));
  assert.equal(february.current.from, '2024-02-01');
  assert.equal(february.current.to, '2024-02-29');
  assert.equal(february.current.end.toISOString(), '2024-03-01T00:00:00.000Z');
  assert.equal(february.previous.from, '2024-01-01');
  assert.equal(february.previous.to, '2024-01-31');

  const march = businessReportPeriods({ kind: 'monthly' }, 'UTC', new Date('2024-03-31T12:00:00Z'));
  assert.equal(march.comparable, false);
  assert.equal(march.previous.to, '2024-02-29');
});

test('weekly boundaries respect a daylight-saving transition and validate the reporting date', () => {
  const now = new Date('2024-03-13T00:00:00Z');
  const report = businessReportPeriods({ kind: 'weekly', date: '2024-03-10' }, 'America/New_York', now);
  assert.equal(report.current.start.toISOString(), '2024-03-04T05:00:00.000Z');
  assert.equal(report.current.end.toISOString(), '2024-03-11T04:00:00.000Z');
  assert.equal(businessReportRequest.safeParse({ kind: 'daily' }).success, false);
  assert.equal(businessReportRequest.safeParse({ kind: 'monthly', date: '2023-02-29' }).success, false);
  assert.equal(businessReportRequest.safeParse({ kind: 'monthly', timezone: 'UTC' }).success, false);
  assert.throws(() => businessReportPeriods({ kind: 'weekly', date: '2024-03-14' }, 'UTC', now), /report date/);
});

const observations: ReportInsight[] = [
  {
    id: 'acquisition', observation: 'Lead acquisition', support: ['2 observed leads'],
    implication: 'Review inbound coverage.', coverageImplication: 'Coverage is limited.', quality: 'partial',
    action: { label: 'Open the CRM', destination: 'leads' }, emphasis: 'impact',
  },
  {
    id: 'follow-ups', observation: 'Follow-up coverage', support: ['1 overdue follow-up'],
    implication: 'Review the current schedule.', coverageImplication: 'Only recorded follow-ups are included.', quality: 'measured',
    action: { label: 'Open follow-ups', destination: 'followups' }, emphasis: 'impact',
  },
];

test('Gemini can reorder evidence and select an existing implication without writing claims', async () => {
  const result = await shapeReportInterpretation(observations, async (prompt) => {
    assert.match(prompt, /2 observed leads/);
    assert.doesNotMatch(prompt, /Open the CRM|Review inbound coverage/);
    return { insights: [{ id: 'follow-ups', emphasis: 'coverage' }, { id: 'acquisition', emphasis: 'impact' }] };
  });
  assert.equal(result.usedGemini, true);
  assert.deepEqual(result.insights.map(({ id }) => id), ['follow-ups', 'acquisition']);
  assert.deepEqual(result.insights[0], { ...observations[1], emphasis: 'coverage' });
});

test('Gemini absence, provider errors, and invalid evidence selections leave deterministic insights intact', async () => {
  assert.deepEqual(await shapeReportInterpretation(observations), { insights: observations, usedGemini: false });
  const malformed = [
    [{ id: 'acquisition', emphasis: 'impact' }],
    [{ id: 'acquisition', emphasis: 'impact' }, { id: 'acquisition', emphasis: 'impact' }],
    [{ id: 'fabricated', emphasis: 'impact' }, { id: 'acquisition', emphasis: 'impact' }],
    [{ id: 'follow-ups', emphasis: 'impact', claim: 'invented' }, { id: 'acquisition', emphasis: 'impact' }],
  ];
  for (const insights of malformed) {
    assert.deepEqual(await shapeReportInterpretation(observations, async () => ({ insights })), {
      insights: observations, usedGemini: false,
    });
  }
  assert.deepEqual(await shapeReportInterpretation(observations, async () => { throw new Error('503'); }), {
    insights: observations, usedGemini: false,
  });
});
