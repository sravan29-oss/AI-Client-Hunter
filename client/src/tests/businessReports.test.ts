import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BusinessReportDocument, BusinessReports } from '../components/BusinessReports';
import type { BusinessReport } from '../types/businessReports';

const report: BusinessReport = {
  id: 'fixture-report', kind: 'monthly', timezone: 'Asia/Kolkata', periodFrom: '2024-08-01', periodTo: '2024-08-31',
  origin: 'deterministic', createdAt: '2024-09-01T06:00:00Z', sourceReportId: null,
  snapshot: {
    version: 1, measuredAt: '2024-09-01T06:00:00Z', partialToday: false, previous: null,
    discovered: { value: 0, comparison: null },
    growth: { kpis: [], qualification: { added: 0, assessed: 0, qualified: 0 }, statusDistribution: [],
      quoteValues: [], excludedQuoteAmounts: 0, actualRevenue: { status: 'unavailable' } },
    market: { coverage: { leads: 0, withProvider: 0, withIndustry: 0, sourcedIndustry: 0, verifiedCountry: 0, verifiedCity: 0 },
      priority: [], industries: [], locations: [], minimumSample: 5 },
    proposalsDelivered: 0, review: [], engagement: { deliveries: { value: 0, comparison: null },
      replies: { value: 0, comparison: null }, responses: 0, objections: [] }, insights: [], model: null,
  },
};
const callbacks = { onNavigate: () => {}, onOpenLead: () => {} };

test('business reports expose period controls and render an empty saved snapshot honestly', () => {
  const launcher = renderToStaticMarkup(createElement(BusinessReports, callbacks));
  assert.match(launcher, /Weekly/);
  assert.match(launcher, /Monthly/);
  assert.match(launcher, /Generate report/);
  const html = renderToStaticMarkup(createElement(BusinessReportDocument, { report, ...callbacks }));
  assert.match(html, /Monthly business report/);
  assert.match(html, /2024-08-01 to 2024-08-31/);
  assert.match(html, /Asia\/Kolkata/);
  assert.match(html, /Saved snapshot/);
  assert.match(html, /No equivalent comparison period/);
  assert.match(html, /Actual revenue unavailable/);
  assert.match(html, /No priced proposals/);
  assert.match(html, /Deterministic recommendations/);
});

test('business snapshots distinguish Gemini emphasis and keep INR and USD amounts separate', () => {
  const interpreted: BusinessReport = { ...report, kind: 'weekly', origin: 'gemini', sourceReportId: report.id,
    snapshot: { ...report.snapshot, model: 'gemini-fixture', previous: { from: '2024-07-25', to: '2024-07-31' },
      growth: { ...report.snapshot.growth, quoteValues: [
        { currency: 'INR', totalMinor: '10050', quotes: 1 }, { currency: 'USD', totalMinor: '2050', quotes: 1 },
      ] },
      insights: [{ id: 'source', observation: 'Acquisition coverage', support: ['2 recorded sources'],
        implication: 'Impact view detail', coverageImplication: 'Review incomplete coverage.', quality: 'Partial',
        emphasis: 'coverage', action: { label: 'Review sources', destination: 'find-clients' } }],
    },
  };
  const html = renderToStaticMarkup(createElement(BusinessReportDocument, { report: interpreted, ...callbacks }));
  assert.match(html, /Weekly business report/);
  assert.match(html, /Gemini interpretation.*gemini-fixture/);
  assert.match(html, /INR.*100\.50/);
  assert.match(html, /USD.*20\.50/);
  assert.match(html, /Review incomplete coverage/);
  assert.match(html, /Review sources/);
  assert.match(html, /2 recorded sources/);
  assert.doesNotMatch(html, /Impact view detail/);
});
