import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';

// Reusable lead schema validator
const leadValidationSchema = z.object({
  businessName: z.string().min(1, 'Business name is required'),
  website: z
    .string()
    .url('Website must be a valid URL')
    .or(z.string().regex(/^https?:\/\//))
    .nullable()
    .optional(),
  country: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  industry: z.string().default('Technology'),
  businessEmail: z.string().email('Invalid email address').nullable().optional().or(z.literal('')),
  contactName: z.string().nullable().optional(),
  publicBusinessPhone: z.string().nullable().optional(),
  opportunityScore: z.number().int().min(0).max(100).default(70),
  leadStatus: z
    .enum([
      'New',
      'Analysed',
      'Ready to Contact',
      'Ready_to_Contact',
      'Contacted',
      'Replied',
      'Meeting Scheduled',
      'Meeting_Scheduled',
      'Negotiation',
      'Won',
      'Lost',
    ])
    .default('New'),
});

function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

describe('Lead Validation & Duplicate Detection', () => {
  it('should validate valid lead payload', () => {
    const validLead = {
      businessName: 'NextWave Logistics',
      website: 'https://nextwavelogistics.com',
      country: 'United States',
      city: 'Austin',
      industry: 'Logistics',
      businessEmail: 'contact@nextwavelogistics.com',
      opportunityScore: 85,
      leadStatus: 'New',
    };

    const result = leadValidationSchema.safeParse(validLead);
    assert.strictEqual(result.success, true, 'Valid lead must parse successfully');
  });

  it('should reject lead without businessName', () => {
    const invalidLead = {
      website: 'https://no-name.com',
      industry: 'Technology',
    };

    const result = leadValidationSchema.safeParse(invalidLead);
    assert.strictEqual(result.success, false, 'Lead without businessName must fail');
  });

  it('should reject invalid email format', () => {
    const invalidEmailLead = {
      businessName: 'Test Corp',
      businessEmail: 'not-an-email',
    };

    const result = leadValidationSchema.safeParse(invalidEmailLead);
    assert.strictEqual(result.success, false, 'Invalid email must fail validation');
  });

  it('should correctly normalize domains for duplicate detection', () => {
    const domain1 = normalizeDomain('https://www.example.com/about');
    const domain2 = normalizeDomain('http://example.com');
    const domain3 = normalizeDomain('EXAMPLE.COM/contact');
    const domain4 = normalizeDomain('https://sub.example.com');

    assert.strictEqual(domain1, 'example.com');
    assert.strictEqual(domain2, 'example.com');
    assert.strictEqual(domain3, 'example.com');
    assert.strictEqual(domain1, domain2, 'Domains with and without www/protocol must match');
    assert.notStrictEqual(domain1, domain4, 'Subdomains must be distinguished');
  });
});
