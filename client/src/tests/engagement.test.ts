import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eligibilityLabels, pastEventInstant, policyChoices, responseLabels } from '../utils/engagement';

test('distinguishes channel opt-out from a lead-wide stop and uses explicit unrecorded consent labels', () => {
  assert.deepEqual(policyChoices('ALL'), ['SUPPRESSED', 'CLEARED']);
  assert.deepEqual(policyChoices('WHATSAPP'), ['GRANTED', 'RESTRICTED', 'OPTED_OUT']);
  assert.equal(eligibilityLabels.CONSENT_REQUIRED, 'Consent required');
  assert.equal(responseLabels.OPT_OUT, 'Opt-out request');
});

test('rejects future or invalid actual event times and keeps timezone offsets', () => {
  const now = new Date('2026-11-24T09:00:00Z');
  assert.equal(pastEventInstant('', now), undefined);
  assert.equal(pastEventInstant('2026-11-24T18:30:00+05:30', now), undefined);
  assert.equal(pastEventInstant('2026-11-24T11:00:00+05:30', now), '2026-11-24T05:30:00.000Z');
});
