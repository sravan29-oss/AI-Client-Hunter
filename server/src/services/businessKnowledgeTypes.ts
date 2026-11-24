import { z } from 'zod';

export const publicLink = z.string().trim().max(500).refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Enter an HTTP or HTTPS URL without credentials.').transform((value) => new URL(value).toString());

const shortText = (limit: number) => z.string().trim().min(1).max(limit).regex(/^[^\r\n\p{Cc}]+$/u, 'Enter a single line of text.');

const labels = (maximum: number) => z.array(shortText(100)).max(maximum).transform((items) => Array.from(new Set(items)));
export const revisionSchema = z.number().int().positive();

export const businessProfileSchema = z.object({
  displayName: shortText(120),
  professionalRole: shortText(160),
  portfolioUrl: publicLink,
  services: labels(40).refine((items) => items.length > 0, 'Add at least one service.'),
  technologies: labels(50),
  defaultCurrency: z.enum(['INR', 'USD', 'EUR', 'GBP']),
});

const claimKind = z.enum(['description', 'feature', 'technology', 'business_problem', 'screenshot']);
export const projectClaimSchema = z.object({
  kind: claimKind,
  statement: shortText(500),
  evidence: shortText(300),
  evidenceUrl: publicLink.optional(),
  approved: z.boolean(),
}).superRefine((claim, context) => {
  if (claim.kind === 'screenshot' && !claim.evidenceUrl) {
    context.addIssue({ code: 'custom', path: ['evidenceUrl'], message: 'Provide the screenshot URL.' });
  }
});

export const projectClaimsSchema = z.array(projectClaimSchema).max(30);
export const portfolioProjectSchema = z.object({
  name: shortText(160),
  url: publicLink,
  serviceCategories: labels(15),
  claims: projectClaimsSchema,
  shareable: z.boolean(),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
export type PortfolioProjectInput = z.infer<typeof portfolioProjectSchema>;
export type ProjectClaim = z.infer<typeof projectClaimSchema>;
