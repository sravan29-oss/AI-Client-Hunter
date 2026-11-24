import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BusinessGrowthContent } from '../components/BusinessIntelligence';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { formatGrowthAmount } from '../utils/reportAmounts';
import type { BusinessGrowthReport } from '../types/businessGrowth';

const emptyReport: BusinessGrowthReport = {
  timezone: 'Asia/Kolkata', asOf: '2026-11-24T10:00:00Z', today: '2026-11-24', partialToday: false,
  period: { from: '2026-11-01', to: '2026-11-07' }, previous: { from: '2026-10-25', to: '2026-10-31' },
  kpis: [
    { key: 'totalLeads', value: 0, comparison: null }, { key: 'proposalsCreated', value: 0, comparison: null },
    { key: 'completedFollowUps', value: 0, comparison: null },
  ],
  coverage: { totalLeads: 0, providerLeads: 0, assessedLeads: 0, proposals: 0, closedDeals: 0, paymentRecords: null },
  qualification: { added: 0, assessed: 0, qualified: 0 }, statusDistribution: [], timeline: [], quoteValues: [],
  excludedQuoteAmounts: 0, actualRevenue: { status: 'unavailable' },
};

test('all-time analytics labels CRM cohorts and withholds a response rate without deliveries', () => {
  const html = renderToStaticMarkup(createElement(AnalyticsPage, { analytics: null }));
  assert.match(html, /CRM Leads by Country/);
  assert.match(html, /Suggested Services on CRM Leads/);
  assert.match(html, /No recorded deliveries/);
  assert.doesNotMatch(html, /0% response rate|Market Share|Service Demand/);
});

test('renders date, missing-data guidance and honest revenue without an empty chart', () => {
  const html = renderToStaticMarkup(createElement(BusinessGrowthContent, { report: emptyReport, onNavigate: () => {} }));
  assert.match(html, /Asia\/Kolkata/);
  assert.match(html, /Actual revenue unavailable/);
  assert.match(html, /Comparison unavailable/);
  assert.match(html, /Qualification assessments for leads/);
  assert.match(html, /No priced proposals were saved/);
  assert.doesNotMatch(html, /recharts-wrapper|₹0|\$0/);
});

test('formats each quote currency in minor units and renders a meaningful comparison', () => {
  assert.equal(formatGrowthAmount('INR', '12345678'), '₹1,23,456.78');
  assert.equal(formatGrowthAmount('USD', '901'), '$9.01');
  const report: BusinessGrowthReport = { ...emptyReport,
    kpis: [{ key: 'proposalsCreated', value: 2, comparison: { value: 1, delta: 1 } }],
    quoteValues: [{ currency: 'INR', totalMinor: '12345', quotes: 1 }, { currency: 'USD', totalMinor: '5000', quotes: 1 }],
  };
  const html = renderToStaticMarkup(createElement(BusinessGrowthContent, { report, onNavigate: () => {} }));
  assert.match(html, /\+1 vs previous \(1\)/);
  assert.match(html, /₹123\.45/);
  assert.match(html, /\$50\.00/);
  assert.match(html, /Actual revenue unavailable/);
});
