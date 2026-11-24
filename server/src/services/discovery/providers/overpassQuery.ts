import { z } from 'zod';
import { ProviderFailure } from '../providerErrors';
import type { DiscoveryFilter } from '../types';

export const overpassId = 'overpass';
const businessTagKeys = ['amenity', 'shop', 'tourism', 'office', 'healthcare', 'craft', 'leisure', 'education', 'club'] as const;
export const osmTagFilter = z.object({
  key: z.enum(businessTagKeys),
  value: z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}_ .:-]+$/u),
});
export const osmTagFilters = z.array(osmTagFilter).max(6);

const categorySelectors: Record<string, string[]> = {
  restaurants: ['["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub)$"]'],
  'retail stores': ['["shop"]["shop"!="vacant"]["shop"!="no"]'],
  hotels: ['["tourism"~"^(hotel|motel|hostel|guest_house|apartment|resort)$"]'],
  offices: ['["office"]["office"!="vacant"]["office"!="no"]'],
  'healthcare businesses': ['["healthcare"]["healthcare"!="no"]', '["amenity"~"^(hospital|clinic|doctors|dentist|pharmacy|veterinary)$"]'],
  education: ['["amenity"~"^(school|college|university|kindergarten|language_school|training)$"]', '["education"]'],
  'real estate': ['["office"~"^(estate_agent|property_management)$"]'],
  'e-commerce': ['["shop"~"^(electronics|computer|mobile_phone|department_store|mall)$"]'],
  'travel agencies': ['["shop"="travel_agency"]', '["office"="travel_agent"]'],
  'local service providers': ['["craft"]', '["shop"~"^(hairdresser|beauty|car_repair|dry_cleaning|laundry)$"]'],
  startups: ['["office"~"^(it|coworking|company|research)$"]'],
  'professional services': ['["office"~"^(lawyer|accountant|consulting|architect|insurance|financial)$"]'],
};

const areaName = z.string().trim().min(2).max(120).regex(/^[^\p{Cc}\p{Cf}]+$/u);
const quote = JSON.stringify;
const categoryAliases: Record<string, string> = {
  'retail shops': 'retail stores', healthcare: 'healthcare businesses', 'local services': 'local service providers',
};

function nameFilter(key: string, name: string) {
  return `[${quote(key)}=${quote(name)}]`;
}

export function makeOverpassQuery(filters: DiscoveryFilter) {
  const city = areaName.safeParse(filters.city);
  const country = areaName.safeParse(filters.country);
  if (!city.success || !country.success) {
    throw new ProviderFailure(overpassId, 'invalid_input', undefined, 'Overpass requires both a city and country to bound the search.');
  }
  const tags = osmTagFilters.safeParse(filters.osmTags ?? []);
  if (!tags.success) throw new ProviderFailure(overpassId, 'invalid_input', undefined, 'Enter valid OSM key=value filters.');

  const extra = tags.data.map(({ key, value }) => `[${quote(key)}=${quote(value)}]`).sort().join('');
  const category = filters.industry.trim().toLowerCase();
  const selectors = categorySelectors[categoryAliases[category] ?? category];
  if (!selectors && !extra) {
    throw new ProviderFailure(overpassId, 'invalid_input', undefined, 'Choose a supported Overpass category or provide OSM tags.');
  }
  const limit = Math.min(50, Math.max(1, filters.maxLeads || 10));
  const candidates = Math.min(100, limit * 3);
  const boundary = '["boundary"="administrative"]["admin_level"="2"]';
  const countryCode = filters.profileSnapshot?.location.countryCode ?? (/^[a-z]{2}$/i.test(country.data) ? country.data.toUpperCase() : null);
  const countryAreas = countryCode
    ? `area${boundary}["ISO3166-1"=${quote(countryCode)}];`
    : `area${boundary}${nameFilter('name', country.data)}; area${boundary}${nameFilter('name:en', country.data)};`;
  const cityBoundary = 'rel(area.country)["boundary"="administrative"]["admin_level"~"^([4-9]|10)$"]';
  const radius = filters.profileSnapshot?.location.radius;
  const around = radius ? `(around:${Math.round(radius.km * 1000)},${radius.latitude},${radius.longitude})` : '';

  return {
    city: city.data,
    country: country.data,
    limit,
    query: `[out:json][timeout:12][maxsize:67108864];
(${countryAreas})->.country;
(${cityBoundary}${nameFilter('name', city.data)}; ${cityBoundary}${nameFilter('name:en', city.data)};)->.cities;
.cities map_to_area ->.cityAreas;
.cityAreas out ids 1;
(${(selectors ?? ['']).map((selector) => `nwr(area.cityAreas)${around}["name"]${selector}${extra};`).join('\n')});
out center qt ${candidates};`,
  };
}
