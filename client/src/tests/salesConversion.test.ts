import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableDraftActions, followUpDueAt, formatQuoteAmount } from '../utils/salesConversion';

test('keeps approval ahead of manual delivery and exposes only valid lifecycle actions', () => {
  assert.deepEqual(availableDraftActions({ status: 'DRAFT' }), ['approve']);
  assert.deepEqual(availableDraftActions({ status: 'DRAFT', approvedAt: '2026-11-23T00:00:00Z' }), ['record-send']);
  assert.deepEqual(availableDraftActions({ status: 'SENT' }), ['record-reply', 'record-conversion']);
  assert.deepEqual(availableDraftActions({ status: 'REPLIED' }), ['record-conversion']);
  assert.deepEqual(availableDraftActions({ status: 'CONVERTED' }), []);
});

test('requires a valid future reminder and preserves the selected local time as a UTC instant', () => {
  const now = new Date('2026-11-23T00:00:00Z');
  assert.equal(followUpDueAt('invalid', now), undefined);
  assert.equal(followUpDueAt('2026-11-22T23:00:00Z', now), undefined);
  assert.equal(followUpDueAt('2026-11-23T09:30:00+05:30', now), '2026-11-23T04:00:00.000Z');
  assert.equal(followUpDueAt('2026-11-25T09:30', now), new Date('2026-11-25T09:30').toISOString());
});

test('renders a saved estimate in its original currency using minor units', () => {
  assert.equal(formatQuoteAmount('USD', 123456), '$1,234.56');
  assert.equal(formatQuoteAmount('INR', 123456), '₹1,234.56');
});
