import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { config } from '../../config';
import { isDatabaseConnected, prisma } from '../../db/prisma';
import { extractDomain } from '../../utils/domain';
import { AppError } from '../../utils/errors';
import { WebsiteHttpError } from '../../utils/ssrfProtection';
import { safeScrapeWebsite, type WebsiteEvidence } from '../scraper';
import type { DiscoveredLead } from './types';
import type { DiscoveryObservation } from '../../db/leadIdentity';

export type WebsiteInspection =
  | { status: 'ANALYZED'; evidence: WebsiteEvidence; inspectedAt: string; cached: boolean }
  | { status: 'FAILED'; detail: string; httpStatus: number | null; inspectedAt: string }
  | { status: 'NOT_LISTED' };

const pending = new Map<string, Promise<WebsiteInspection>>();

export function publicWebLink(input?: string | null) {
  if (!input || input.length > 2048) return undefined;
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    url.hash = '';
    return url.href;
  } catch { return undefined; }
}

export async function inspectListedWebsite(input?: string | null): Promise<WebsiteInspection> {
  if (!input) return { status: 'NOT_LISTED' };
  const url = publicWebLink(input);
  if (!url) return { status: 'FAILED', detail: 'The listed website is not a valid public HTTP or HTTPS URL.', httpStatus: null, inspectedAt: new Date().toISOString() };
  const existing = pending.get(url);
  if (existing) return existing;
  const task = inspect(url).finally(() => pending.delete(url));
  pending.set(url, task);
  return task;
}

async function inspect(url: string): Promise<WebsiteInspection> {
  const cacheHours = config.DISCOVERY_WEBSITE_CACHE_HOURS;
  if (isDatabaseConnected && cacheHours) {
    const cached = await prisma.websiteInspectionCache.findUnique({ where: { url } });
    const entry = cached?.evidence as { evidence?: WebsiteEvidence; inspectedAt?: string } | undefined;
    if (cached && cached.expiresAt > new Date() && entry?.evidence && entry.inspectedAt) {
      return { status: 'ANALYZED', evidence: entry.evidence, inspectedAt: entry.inspectedAt, cached: true };
    }
  }
  try {
    const evidence = await safeScrapeWebsite(url);
    const inspectedAt = new Date().toISOString();
    if (isDatabaseConnected && cacheHours) {
      const data = { evidence: JSON.parse(JSON.stringify({ evidence, inspectedAt })) as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + cacheHours * 3600000) };
      await prisma.websiteInspectionCache.upsert({ where: { url }, create: { url, ...data }, update: data });
    }
    return { status: 'ANALYZED', evidence, inspectedAt, cached: false };
  } catch (error) {
    return { status: 'FAILED', detail: error instanceof AppError ? error.message : 'Website inspection could not be completed.',
      httpStatus: error instanceof WebsiteHttpError ? error.upstreamStatus : null, inspectedAt: new Date().toISOString() };
  }
}

export function listingObservation(lead: DiscoveredLead): DiscoveryObservation {
  const listing = lead.listingEvidence;
  return {
    providerId: lead.providerId, address: listing?.address?.slice(0, 500), discoveryDate: lead.discoveryDate,
    reference: listing?.sourceReference?.slice(0, 300) ?? (lead.osmObject ? `${lead.osmObject.type}/${lead.osmObject.id}` : undefined),
    sourceUrl: publicWebLink(listing?.sourceUrl),
  };
}

export function enrichBusiness(lead: DiscoveredLead, inspection: WebsiteInspection) {
  const observation = listingObservation(lead);
  const evidence = inspection.status === 'ANALYZED' ? inspection.evidence : undefined;
  const sameSite = evidence && extractDomain(lead.website) === extractDomain(evidence.finalUrl) ? evidence : undefined;
  const directoryEmail = z.email().safeParse(lead.businessEmail).data;
  const websiteEmail = sameSite?.emailsFound.find((email) => email.length <= 254 && z.email().safeParse(email).success);
  const directoryPhone = lead.publicBusinessPhone?.trim().slice(0, 80) || undefined;
  const websitePhone = sameSite?.phonesFound.find((phone) => /^\+?[\d ().-]{6,30}$/.test(phone) && phone.replace(/\D/g, '').length >= 7);
  const directory = observation.sourceUrl ?? observation.reference ?? lead.providerName;
  const source = (value: string | undefined, page?: string) => value ? { value, source: page ?? directory } : undefined;
  const socialLinks = Object.entries(sameSite?.socialLinks ?? {}).flatMap(([platform, value]) => {
    const url = publicWebLink(value);
    return url ? [{ platform, url, source: sameSite!.finalUrl }] : [];
  });
  const description = lead.businessDescription?.trim().replace(/\p{Cc}/gu, ' ').slice(0, 1200) || undefined;
  return {
    observation, evidence, businessEmail: directoryEmail ?? websiteEmail ?? null, publicBusinessPhone: directoryPhone ?? websitePhone ?? null,
    fields: {
      businessName: source(lead.businessName), website: source(publicWebLink(lead.website)),
      address: source(observation.address), category: source(lead.listingEvidence?.categories?.join(', ').slice(0, 300)),
      city: source(lead.listingEvidence?.city ?? (lead.listingEvidence?.mappedBoundary ? lead.city ?? undefined : undefined)),
      country: source(lead.listingEvidence?.countryCode ?? (lead.listingEvidence?.mappedBoundary ? lead.country : undefined)),
      status: source(lead.listingEvidence?.businessStatus),
      description: source(description), email: source(directoryEmail ?? websiteEmail, directoryEmail ? undefined : sameSite?.finalUrl),
      phone: source(directoryPhone ?? websitePhone, directoryPhone ? undefined : sameSite?.finalUrl),
    },
    socialLinks,
    inspection: inspection.status === 'ANALYZED'
      ? { status: inspection.status, httpStatus: inspection.evidence.statusCode, inspectedAt: inspection.inspectedAt, cached: inspection.cached }
      : inspection,
  };
}
