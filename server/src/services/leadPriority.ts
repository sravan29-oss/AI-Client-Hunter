import { extractDomain } from '../utils/domain';
import { normalizeCity, normalizeCountry, normalizedLabel, providerIds, type IdealProfileTargeting } from './idealProfileTypes';

export const priorityRules = {
  version: 'crm-evidence-v1',
  weights: { profileFit: 35, opportunity: 25, salesActivity: 25, followUp: 15 },
  high: 70, medium: 40, minimumSignals: 2,
} as const;
export const priorityCategories = ['high', 'medium', 'low', 'insufficient'] as const;
export type PriorityCategory = typeof priorityCategories[number];
export const closedLeadStages = new Set(['Won', 'Lost', 'Archived', 'Rejected', 'Not_Interested']);
const day = 86_400_000;
const negativeResponses = new Set(['NOT_INTERESTED', 'OPT_OUT']);
const directoryProviders = new Set<string>([...providerIds, 'openstreetmap']);

export type PriorityLead = {
  id: string; businessName: string; city: string | null; country: string | null; industry: string;
  website: string | null; leadStatus: string; qualificationStatus: string | null; qualificationScore: number | null;
  createdAt: Date; discoveryEvidence: unknown;
  discoverySources: Array<{ providerId: string; reference: string; sourceUrl: string | null }>;
  audits: Array<{ websiteUrl: string; rawData: unknown }>;
  pitches: Array<{ proposal: unknown; status: string; sentAt: Date | null; createdAt: Date }>;
  followUps: Array<{ dueAt: Date }>;
  communicationPolicies: Array<{ scope: string; status: string }>;
};

export type LeadResponse = { kind: string; date: Date };
type Service = 'website' | 'redesign' | 'commerce' | 'react' | 'mobile' | 'dashboard' | 'api' | 'database' | 'ai';
const serviceLabels: Record<Service, string> = {
  website: 'Website development', redesign: 'Website redesign and UI/UX', commerce: 'E-commerce development',
  react: 'React development', mobile: 'React Native applications', dashboard: 'Admin dashboards',
  api: 'Backend API development', database: 'Database integration', ai: 'AI application development',
};
const packageServices: Record<string, Service> = {
  business_website: 'website', ecommerce: 'commerce', react_native: 'mobile', admin_dashboard: 'dashboard',
  backend_api: 'api', ai_integration: 'ai',
};

export const jsonObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const field = (lead: PriorityLead, name: string) => jsonObject(jsonObject(jsonObject(lead.discoveryEvidence).fields)[name]);
const cleanLabel = (value: string | null) => value?.trim().replace(/\s+/g, ' ') || '';

function sourceMatches(lead: PriorityLead, source: unknown) {
  return typeof source === 'string' && source.length > 0
    && lead.discoverySources.some((row) => directoryProviders.has(row.providerId.trim().toLowerCase()) && row.reference.trim()
      && (row.reference === source || row.sourceUrl === source));
}

export function verifiedLeadLocation(lead: PriorityLead) {
  const recordedCountry = normalizeCountry(lead.country ?? '');
  const addressField = field(lead, 'address');
  const parts = sourceMatches(lead, addressField.source)
    ? text(addressField.value).split(',').map((part) => part.trim()).filter(Boolean) : [];
  const countryField = field(lead, 'country');
  const sourcedCountry = normalizeCountry(text(countryField.value) && sourceMatches(lead, countryField.source)
    ? text(countryField.value) : parts.at(-1) ?? '');
  if (!recordedCountry || sourcedCountry?.countryCode !== recordedCountry.countryCode) {
    return null;
  }
  const cityField = field(lead, 'city');
  const code = recordedCountry.countryCode;
  const city = normalizeCity(code, cleanLabel(lead.city));
  const cityKey = normalizedLabel(city);
  const candidates = text(cityField.value) && sourceMatches(lead, cityField.source)
    ? [text(cityField.value)]
    : parts.slice(1, -1).map((part) => part.replace(/\s+\d[\d -]*$/, ''));
  return {
    country: recordedCountry.country, countryCode: code,
    city: cityKey && candidates.some((part) => normalizedLabel(normalizeCity(code, part)) === cityKey) ? city : null,
  };
}

export function isQualifiedLead(lead: PriorityLead) {
  return lead.qualificationStatus === 'QUALIFIED' || lead.leadStatus === 'Qualified';
}

function serviceKind(name: string): Service | undefined {
  const value = normalizedLabel(name);
  if (/\b(e commerce|ecommerce|storefront|online store)\b/.test(value)) return 'commerce';
  if (/\b(redesign|ui ux|ui design|ux design|accessibility)\b/.test(value)) return 'redesign';
  if (/\b(react native|mobile app|mobile applications)\b/.test(value)) return 'mobile';
  if (/\breact\b/.test(value)) return 'react';
  if (/\bdashboard\b/.test(value)) return 'dashboard';
  if (/\b(database|postgresql|supabase)\b/.test(value)) return 'database';
  if (/\b(ai|artificial intelligence|gemini)\b/.test(value)) return 'ai';
  if (/\b(backend|api|express)\b/.test(value)) return 'api';
  if (/\b(website|web development|web design)\b/.test(value)) return 'website';
  return undefined;
}

export function isProposalSnapshot(proposal: unknown) {
  const { currency, totalMinor } = jsonObject(proposal);
  return (currency === 'INR' || currency === 'USD') && typeof totalMinor === 'number' && Number.isSafeInteger(totalMinor) && totalMinor >= 0;
}

function websiteSignals(lead: PriorityLead) {
  const domain = extractDomain(lead.website);
  const audit = lead.audits.find((item) => domain && extractDomain(item.websiteUrl) === domain);
  const raw = jsonObject(jsonObject(audit?.rawData).evidence);
  const observed: Array<{ service: Service; reason: string }> = [];
  if (typeof raw.statusCode === 'number' && raw.statusCode >= 200 && raw.statusCode < 300
    && extractDomain(text(raw.finalUrl) || text(raw.url)) === domain && domain) {
    if (raw.isResponsiveReady === false) observed.push({ service: 'redesign', reason: 'A saved page audit recorded a mobile viewport issue.' });
    if (typeof raw.imagesMissingAltCount === 'number' && raw.imagesMissingAltCount > 0) observed.push({
      service: 'redesign', reason: 'A saved page audit found images missing alternative text.',
    });
    if (typeof raw.emptyNavLinksCount === 'number' && raw.emptyNavLinksCount > 0) observed.push({
      service: 'redesign', reason: 'A saved page audit recorded placeholder navigation links.',
    });
    if (raw.isHttps === false) observed.push({ service: 'website', reason: 'A saved website audit recorded a page served over HTTP.' });
    if (raw.pageTitleStatus === 'missing' || raw.metaDescriptionStatus === 'missing') observed.push({
      service: 'website', reason: 'A saved page audit found missing page metadata.',
    });
    if (Array.isArray(raw.commerceIndicators) && raw.commerceIndicators.includes('product catalogue link')
      && !raw.commerceIndicators.includes('checkout link')) observed.push({
      service: 'commerce', reason: 'A saved page audit observed a catalogue link. Review the ordering journey before proposing changes.',
    });
    return { inspected: true, observed };
  }
  // Discovery keeps an allowlisted set of finding IDs generated from measured website observations.
  const evidence = jsonObject(lead.discoveryEvidence);
  const inspection = jsonObject(evidence.inspection);
  const listed = field(lead, 'website');
  if (domain && extractDomain(text(listed.value)) === domain && inspection.status === 'ANALYZED'
    && typeof inspection.httpStatus === 'number' && inspection.httpStatus >= 200 && inspection.httpStatus < 300) {
    const findings = jsonObject(evidence.analysis).findings;
    const ids = new Set(Array.isArray(findings) ? findings.map((finding) => text(jsonObject(finding).id)) : []);
    if (['viewport', 'images', 'navigation'].some((id) => ids.has(id))) observed.push({
      service: 'redesign', reason: 'Saved discovery evidence records a mobile, accessibility, or navigation finding on the inspected page.',
    });
    if (['metadata', 'http'].some((id) => ids.has(id))) observed.push({
      service: 'website', reason: 'Saved discovery evidence records a metadata or HTTPS finding on the inspected page.',
    });
    if (ids.has('commerce')) observed.push({
      service: 'commerce', reason: 'Saved discovery evidence records a catalogue link. Review the ordering journey before proposing changes.',
    });
    return { inspected: true, observed };
  }
  return { inspected: false, observed };
}

export function evaluateLeadPriority(lead: PriorityLead, input: {
  offerings: string[]; targeting: IdealProfileTargeting | null; response?: LeadResponse; now: Date;
}) {
  const { offerings, targeting, response, now } = input;
  const increases: Array<{ code: string; points: number; reason: string }> = [];
  const decreases: typeof increases = [];
  const missing: string[] = [];
  const signals = new Set<string>();
  const increase = (code: string, points: number, reason: string, signal: string) => {
    increases.push({ code, points, reason });
    signals.add(signal);
  };
  const offered = new Set(offerings.map(serviceKind).filter((item): item is Service => Boolean(item)));
  const website = websiteSignals(lead);
  const qualified = isQualifiedLead(lead);
  const location = verifiedLeadLocation(lead);
  const providers = new Set(lead.discoverySources.filter(({ providerId, reference }) =>
    directoryProviders.has(providerId.trim().toLowerCase()) && reference.trim())
    .map(({ providerId }) => providerId.trim().toLowerCase()));
  const open = !closedLeadStages.has(lead.leadStatus);
  const openProposals = lead.pitches.filter(({ proposal, status, sentAt }) =>
    isProposalSnapshot(proposal) && (status === 'SENT' || status === 'REPLIED') && sentAt && sentAt <= now);

  const matches = new Map<Service, { service: string; evidence: string[]; source: 'website' | 'proposal' | 'both' }>();
  function addMatch(service: Service, reason: string, source: 'website' | 'proposal') {
    if (!offered.has(service)) return;
    const current = matches.get(service);
    if (!current) matches.set(service, { service: serviceLabels[service], evidence: [reason], source });
    else {
      if (!current.evidence.includes(reason)) current.evidence.push(reason);
      if (current.source !== source) current.source = 'both';
    }
  }
  for (const item of website.observed) {
    addMatch(item.service, item.reason, 'website');
    if (item.service === 'redesign' && !offered.has('redesign')) addMatch('website', item.reason, 'website');
  }
  for (const { proposal } of openProposals) {
    const lines = jsonObject(proposal).lines;
    if (!Array.isArray(lines)) continue;
    for (const line of lines) {
      const scope = jsonObject(line);
      const key = text(scope.serviceKey);
      const service = (Object.hasOwn(packageServices, key) ? packageServices[key] : undefined) ?? serviceKind(text(scope.name));
      if (service) addMatch(service, 'A manually delivered proposal already includes this service. Review the quoted scope and current interest.', 'proposal');
    }
  }
  const sourceCategory = field(lead, 'category');
  const industry = normalizedLabel(lead.industry ?? '');
  // Match a recorded listing category as well as the current saved industry.
  const sameIndustry = text(sourceCategory.value).split(',').some((part) => normalizedLabel(part) === industry);
  if (targeting?.industries.some((entry) => normalizedLabel(entry) === industry) && sameIndustry && sourceMatches(lead, sourceCategory.source)) {
    increase('targetIndustry', 10, 'A saved provider category matches the active target industry.', 'target');
  }
  if (location && targeting?.locations.some((item) => item.countryCode === location.countryCode
    && !item.radius && (!item.city || (location.city && normalizedLabel(location.city) === normalizedLabel(item.city))))) {
    increase('targetLocation', 10, 'The verified CRM location matches a configured city or country target.', 'target');
  }
  if (matches.size) {
    increase('serviceFit', 15, 'At least one configured service matches a saved website observation or delivered proposal scope.',
      website.observed.length && [...matches.values()].some((match) => match.source !== 'proposal') ? 'website' : 'proposal');
  }
  if (website.observed.length) increase('websiteObservation', 15, 'The saved inspection contains actionable observations about the reviewed page.', 'website');
  if (qualified) increase('qualified', 8, 'The lead is marked qualified in the CRM.', 'qualification');
  if (providers.size) increase('source', 2, 'The lead has a structured provider reference. Additional references add no points.', 'source');
  if (response && response.date <= now && now.getTime() - response.date.getTime() <= 90 * day && ['QUESTION', 'INTERESTED'].includes(response.kind)) {
    increase('response', 10, 'A linked client response in the last 90 days recorded interest or a question.', 'engagement');
  }
  const lastDelivery = lead.pitches.reduce<Date | null>((latest, pitch) => (
    pitch.sentAt && pitch.sentAt <= now && (!latest || pitch.sentAt > latest) ? pitch.sentAt : latest
  ), null);
  if (lastDelivery && now.getTime() - lastDelivery.getTime() <= 30 * day) {
    increase('delivery', 5, 'The CRM records manual delivery in the last 30 days.', 'engagement');
  }
  if (openProposals.length) increase('proposal', 10, 'The lead has an open, manually delivered proposal snapshot.', 'proposal');
  const pending = lead.followUps.reduce<Date | null>((first, item) => !first || item.dueAt < first ? item.dueAt : first, null);
  if (pending && pending <= now) increase('dueFollowUp', 15, 'A CRM follow-up reminder is pending and due.', 'followUp');
  else if (pending && pending.getTime() - now.getTime() <= 7 * day) {
    increase('upcomingFollowUp', 7, 'A pending CRM follow-up is due within seven days.', 'followUp');
  }
  const restricted = lead.communicationPolicies.some(({ scope, status }) =>
    (scope === 'ALL' && status === 'SUPPRESSED') || status === 'OPTED_OUT' || status === 'RESTRICTED');
  const declined = Boolean(response && negativeResponses.has(response.kind));
  if (restricted || response?.kind === 'OPT_OUT') {
    decreases.push({ code: 'contactRestriction', points: -20, reason: 'The CRM has a recorded opt-out or restriction.' });
    signals.add('policy');
  } else if (declined) {
    decreases.push({ code: 'declined', points: -15, reason: 'The latest recorded response declined interest.' });
    signals.add('engagement');
  }
  if (!website.inspected) missing.push(lead.website ? 'Measured website inspection for the current site' : 'Verified website availability');
  if (!qualified && lead.qualificationScore === null && !lead.qualificationStatus) missing.push('Lead qualification');
  if (!providers.size) missing.push('Structured source reference');
  if (!location?.city) missing.push('Provider-verified city and country');
  if (!offered.size) missing.push('Configured service offerings');
  if (!matches.size) missing.push('Evidence for a service opportunity');
  if (!response) missing.push('Recorded client response');

  const score = Math.max(0, [...increases, ...decreases].reduce((total, factor) => total + factor.points, 0));
  const category: PriorityCategory = signals.size < priorityRules.minimumSignals ? 'insufficient'
    : score >= priorityRules.high ? 'high' : score >= priorityRules.medium ? 'medium' : 'low';
  // Decisions stay in the CRM. Engagement applies recipient and consent checks when its workflow is opened.
  const nextAction = !open ? 'Review the closed CRM record if its outcome needs confirmation.'
    : restricted || declined ? 'Review the recorded contact restriction or decline in Engagement.'
    : pending && pending <= now ? 'Review the pending follow-up and contact eligibility in the CRM.'
    : response && (!lastDelivery || response.date >= lastDelivery) ? 'Review the recorded response before planning next steps.'
    : pending ? 'Review the scheduled follow-up date in the CRM.'
    : openProposals.length ? 'Review the saved proposal and any recorded response in the CRM.'
    : matches.size ? 'Review the saved evidence and confirm scope in the CRM.'
    : 'Verify the missing details in the CRM before assessing a service opportunity.';
  return {
    id: lead.id, businessName: lead.businessName, industry: industry ? cleanLabel(lead.industry) : null,
    industrySourced: sameIndustry && sourceMatches(lead, sourceCategory.source),
    qualified, location, score, category, increases, decreases, missing, nextAction, services: [...matches.values()],
    open, restricted: restricted || declined, sourceCount: providers.size,
  };
}
