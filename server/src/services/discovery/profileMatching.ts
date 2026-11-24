import type { getBusinessKnowledge } from '../businessKnowledge';
import { normalizeCity, normalizeCountry, normalizedLabel, type ProfileSnapshot } from '../idealProfileTypes';
import { serviceCategory } from '../profileOutreach';
import type { WebsiteEvidence } from '../scraper';
import type { DiscoveredLead } from './types';

type Knowledge = Awaited<ReturnType<typeof getBusinessKnowledge>>;
type MatchingKnowledge = { profile: Pick<Knowledge['profile'], 'services'>; projects: ReadonlyArray<Knowledge['projects'][number]> };

const industryTerms: Record<string, string[]> = {
  restaurants: ['restaurant', 'cafe', 'fast food', 'food court', 'bar', 'pub', 'diner'],
  'retail stores': ['shop', 'store', 'retail', 'supermarket', 'bakery', 'boutique', 'mall'],
  'retail shops': ['shop', 'store', 'retail', 'supermarket', 'bakery', 'boutique', 'mall'],
  hotels: ['hotel', 'motel', 'hostel', 'guest house', 'resort', 'lodging'],
  travel: ['travel agency', 'travel agent', 'tour', 'hotel', 'lodging'],
  'travel agencies': ['travel agency', 'travel agent', 'tour operator'],
  healthcare: ['healthcare', 'hospital', 'clinic', 'doctor', 'dentist', 'pharmacy', 'veterinary'],
  'healthcare businesses': ['healthcare', 'hospital', 'clinic', 'doctor', 'dentist', 'pharmacy', 'veterinary'],
  education: ['school', 'college', 'university', 'kindergarten', 'training', 'education'],
  'real estate': ['estate agent', 'real estate', 'property management'],
  'e commerce': ['e commerce', 'electronics', 'computer', 'mobile phone', 'department store', 'mall'],
  startups: ['startup', 'it', 'coworking', 'software', 'technology', 'research'],
  offices: ['office', 'consulting', 'lawyer', 'accountant', 'architect', 'insurance'],
  'professional services': ['professional service', 'lawyer', 'accountant', 'consulting', 'architect', 'insurance', 'financial'],
  'local service providers': ['craft', 'hairdresser', 'beauty', 'car repair', 'dry cleaning', 'laundry', 'plumber', 'electrician'],
  'local businesses': ['business', 'store', 'restaurant', 'shop', 'office', 'service', 'clinic'],
};

function containsLabel(values: string[], labels: string[]) {
  const accepted = labels.flatMap((label) => {
    if (!label) return [];
    const singular = label.replace(/([a-z])ies$/, '$1y')
      .replace(/(ss|ch|sh|x|z)es$/, '$1')
      .replace(/([a-z]{2}[^sui])s$/, '$1');
    return singular === label ? [label] : [label, singular];
  });
  return values.some((value) => {
    const normalized = ` ${normalizedLabel(value)} `;
    return accepted.some((label) => normalized.includes(` ${label} `));
  });
}

function matchesTargetLocation(lead: DiscoveredLead, target: ProfileSnapshot['location']) {
  const evidence = lead.listingEvidence;
  if (!evidence) return false;
  const mapped = lead.providerId === 'overpass' && evidence.mappedBoundary === true;
  if (!mapped) {
    const parts = evidence.address?.split(',').map((part) => part.trim()) ?? [];
    const finalPart = parts.at(-1) ?? '';
    const country = evidence.countryCode ? normalizeCountry(evidence.countryCode) : finalPart.length > 2 ? normalizeCountry(finalPart) : undefined;
    if (country?.countryCode !== target.countryCode) return false;
    if (target.city) {
      const city = normalizedLabel(target.city);
      const partsToCheck = evidence.city ? [evidence.city] : parts.slice(1, -1);
      if (!partsToCheck.some((part) => normalizedLabel(normalizeCity(target.countryCode, part.replace(/\s+\d[\d\s-]*$/, ''))) === city)) return false;
    }
  }
  if (target.radius) {
    if ((!mapped && lead.providerId !== 'google_places') || !evidence.coordinates) return false;
    const { lat, lon } = evidence.coordinates;
    const radians = Math.PI / 180;
    const { latitude, longitude, km } = target.radius;
    const a = Math.sin((lat - latitude) * radians / 2) ** 2
      + Math.cos(latitude * radians) * Math.cos(lat * radians) * Math.sin((lon - longitude) * radians / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) <= km;
  }
  return true;
}

function companySize(count?: number) {
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return null;
  return count <= 10 ? '1–10' : count <= 50 ? '11–50' : count <= 200 ? '51–200' : '201+';
}

export function matchesProfileFilters(lead: DiscoveredLead, snapshot: ProfileSnapshot, industry: string) {
  if (!matchesTargetLocation(lead, snapshot.location)) return false;
  const evidence = lead.listingEvidence;
  const categories = evidence?.categories ?? [];
  const mapped = lead.providerId === 'overpass' && evidence?.mappedBoundary === true;
  const normalizedIndustry = normalizedLabel(industry);
  if (!mapped && !containsLabel(categories, industryTerms[normalizedIndustry] ?? [normalizedIndustry])) return false;
  if (snapshot.targeting.categories.length && !containsLabel(categories, snapshot.targeting.categories.map(normalizedLabel))) return false;
  const size = companySize(evidence?.employeeCount);
  if (size && snapshot.targeting.companySizes.length && !snapshot.targeting.companySizes.includes(size)) return false;
  const budget = snapshot.targeting.minProjectBudget;
  const quoted = evidence?.budget;
  return !(budget && quoted?.currency === budget.currency && Number.isFinite(quoted.amount) && quoted.amount < budget.amount);
}

export function scoreProfileMatch(
  lead: DiscoveredLead, snapshot: ProfileSnapshot, industry: string,
  knowledge: MatchingKnowledge, evidence?: WebsiteEvidence,
) {
  const issues: string[] = [];
  const opportunities: string[] = [];
  if (evidence) {
    if (!evidence.hasViewport) issues.push('The inspected page has no mobile viewport tag.');
    if (!evidence.hasSsl) issues.push('The inspected page loaded over HTTP.');
    if (evidence.imagesMissingAltCount) issues.push(`${evidence.imagesMissingAltCount} images on the inspected page have no alternative text.`);
    if (evidence.metaDescriptionStatus === 'missing') opportunities.push('Add a meta description to the inspected page.');
    if (!evidence.hasContactForm && !evidence.emailsFound.length && !evidence.phonesFound.length && !evidence.hasWhatsApp) {
      opportunities.push('Review enquiry options. The inspected page exposed no recognised contact route.');
    }
    if (issues.length) opportunities.push('Address the observed mobile, HTTPS or accessibility findings.');
  }

  const compatible = snapshot.targeting.services.flatMap((target) => {
    const offered = knowledge.profile.services.find((service) => serviceCategory(service) === serviceCategory(target));
    return offered ? [offered] : [];
  });
  const service = (issues.length || opportunities.length ? compatible.find((item) => serviceCategory(item) === 'website') : undefined) ?? compatible[0] ?? null;
  const portfolio = service ? knowledge.projects.find((project) => project.shareable && !project.archivedAt
    && project.claims.some((claim) => claim.approved && claim.kind !== 'screenshot')
    && project.serviceCategories.some((category) => serviceCategory(category) === serviceCategory(service))) : undefined;
  const listing = lead.listingEvidence;
  const available = [lead.businessName && 'business name', listing?.address && 'listed address', lead.website && 'listed website',
    (lead.businessEmail || lead.publicBusinessPhone) && 'listed business contact', listing?.businessType && 'listed business type'].filter(Boolean);
  const businessType = listing?.businessType;
  const types = snapshot.targeting.preferredBusinessTypes;
  const typeNotes = types.length ? (businessType && containsLabel([businessType], types.map(normalizedLabel))
    ? `Preferred business type matched (${businessType}).` : businessType ? `Listed business type is ${businessType}.` : 'Preferred business type is unverified.') : '';
  const unknown: string[] = [];
  if (snapshot.targeting.companySizes.length && !companySize(listing?.employeeCount)) unknown.push('Company size');
  const targetBudget = snapshot.targeting.minProjectBudget;
  if (targetBudget && (listing?.budget?.currency !== targetBudget.currency || !Number.isFinite(listing?.budget?.amount))) unknown.push('Project budget');
  if (!evidence) unknown.push('Website condition');
  if (types.length && !businessType) unknown.push('Business type');

  const factors = [
    { label: 'Industry relevance', points: 20, max: 20, evidence: `Matched the ${industry} search and listing evidence.` },
    { label: 'Website condition', points: issues.length ? Math.min(15, issues.length * 5) : 0, max: 15, evidence: issues.join(' ') || (evidence ? 'The inspected page showed none of the checked problems.' : 'Website condition was not verified.') },
    { label: 'Development opportunities', points: Math.min(15, opportunities.length * 5), max: 15, evidence: opportunities.join(' ') || 'No development opportunity was verified from the inspected evidence.' },
    { label: 'Service compatibility', points: service ? (portfolio ? 25 : 20) : 0, max: 25, evidence: service ? `${service} is in the business profile.${portfolio ? ` Approved example ${portfolio.name}.` : ''}` : 'The target services do not match a saved business service.' },
    { label: 'Business information', points: Math.min(10, available.length * 2 + (types.length && businessType && containsLabel([businessType], types.map(normalizedLabel)) ? 2 : 0)), max: 10, evidence: `${available.length ? available.join(', ') + '.' : 'No listing details were verified.'} ${typeNotes}`.trim() },
    { label: 'Location relevance', points: 15, max: 15, evidence: `Verified within ${[snapshot.location.city, snapshot.location.country].filter(Boolean).join(', ')}${snapshot.location.radius ? ` and the ${snapshot.location.radius.km} km radius` : ''}.` },
  ];
  return { profileId: snapshot.profileId, profileName: snapshot.profileName, revision: snapshot.revision, service,
    portfolioProjectId: portfolio?.id ?? null, factors, unknown, score: factors.reduce((sum, factor) => sum + factor.points, 0), issues, opportunities };
}
