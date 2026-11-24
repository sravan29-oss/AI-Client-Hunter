import { z } from 'zod';
import { isValidTimeZone } from './discovery/discoverySchedule';

const countryCodes = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(' ');
const regionNames = new Intl.DisplayNames('en', { type: 'region' });

export function normalizedLabel(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const countries = new Map(countryCodes.flatMap((code) => {
  const country = regionNames.of(code) ?? code;
  const entry = { country, countryCode: code };
  return [[normalizedLabel(country), entry], [code.toLowerCase(), entry]] as const;
}));
const countryAliases: Record<string, string> = {
  uk: 'gb', 'u k': 'gb', 'great britain': 'gb', usa: 'us', 'u s a': 'us', 'united states of america': 'us',
  uae: 'ae', 'south korea': 'kr', 'north korea': 'kp', 'czech republic': 'cz', turkey: 'tr', vietnam: 'vn',
  russia: 'ru', 'ivory coast': 'ci',
};
const cityAliases: Record<string, string> = {
  'IN:bangalore': 'Bengaluru', 'IN:bombay': 'Mumbai', 'IN:calcutta': 'Kolkata', 'IN:madras': 'Chennai',
  'US:nyc': 'New York', 'US:new york city': 'New York',
};

export function normalizeCountry(value: string) {
  const key = normalizedLabel(value);
  return countries.get(countryAliases[key] ?? key);
}

export function normalizeCity(countryCode: string, value: string) {
  const city = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const canonical = cityAliases[`${countryCode}:${normalizedLabel(city)}`];
  if (canonical) return canonical;
  return city === city.toUpperCase() || city === city.toLowerCase()
    ? city.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_match, prefix, initial) => prefix + initial.toUpperCase())
    : city;
}

const label = (length: number) => z.string().trim().min(1).max(length).regex(/^[^\p{Cc}\p{Cf}]+$/u, 'Enter a single line of text.');
const labels = (max: number) => z.array(label(100)).max(max).transform((items) => [...new Map(items.map(item => [normalizedLabel(item), item])).values()]);
export const providerIds = ['overpass', 'google_places', 'serpapi'] as const;
export const radiusSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), km: z.number().min(0.1).max(100) });
export const locationScheduleSchema = z.object({
  mode: z.enum(['DAILY', 'WEEKLY', 'MANUAL']),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time in HH:mm format.'),
  timezone: label(100).refine(isValidTimeZone, 'Use a valid IANA time zone.'),
});

export const profileLocationSchema = z.object({
  country: label(120), city: label(120).or(z.literal('')).default(''),
  radius: radiusSchema.nullable().default(null), schedule: locationScheduleSchema.nullable().default(null),
}).transform((location, context) => {
  const country = normalizeCountry(location.country);
  if (!country) {
    context.addIssue({ code: 'custom', path: ['country'], message: 'Enter a country name or ISO alpha-2 code.' });
    return z.NEVER;
  }
  const city = normalizeCity(country.countryCode, location.city);
  if (/[,;]/.test(city)) {
    context.addIssue({ code: 'custom', path: ['city'], message: 'Add each city as a separate target location.' });
    return z.NEVER;
  }
  if (location.radius && !city) {
    context.addIssue({ code: 'custom', path: ['city'], message: 'A radius requires a city.' });
    return z.NEVER;
  }
  return { ...location, ...country, city };
});

export type ProfileLocation = z.infer<typeof profileLocationSchema>;

export function locationKey(location: ProfileLocation) {
  return `${location.countryCode}:${normalizedLabel(location.city)}`;
}

const targetingCriteriaSchema = z.object({
  industries: labels(30).refine((items) => items.length > 0, 'Add at least one industry.'),
  categories: labels(30).default([]),
  companySizes: z.array(z.enum(['1–10', '11–50', '51–200', '201+'])).max(4).default([]),
  services: labels(30).refine((items) => items.length > 0, 'Add at least one target service.'),
  minProjectBudget: z.object({ amount: z.number().int().min(1).max(100000000), currency: z.enum(['INR', 'USD', 'EUR', 'GBP']) }).nullable().default(null),
  preferredBusinessTypes: labels(30).default([]),
  minLeadScore: z.number().int().min(0).max(100),
});
export const targetingSchema = targetingCriteriaSchema.extend({ locations: z.array(profileLocationSchema).min(1).max(40) }).superRefine((targeting, context) => {
  const seen = new Set<string>();
  targeting.locations.forEach((location, index) => {
    const key = locationKey(location);
    if (seen.has(key)) context.addIssue({ code: 'custom', path: ['locations', index], message: 'This country and city are already listed.' });
    seen.add(key);
  });
});

export const idealProfileSchema = z.object({ name: label(120), targeting: targetingSchema });
export const profileSnapshotSchema = z.object({
  profileId: z.string(), profileName: z.string(), revision: z.number().int(), location: profileLocationSchema,
  targeting: targetingCriteriaSchema, scheduledFor: z.iso.datetime().nullable().default(null),
});

export type IdealProfileInput = z.infer<typeof idealProfileSchema>;
export type IdealProfileTargeting = z.infer<typeof targetingSchema>;
export type ProfileSnapshot = z.infer<typeof profileSnapshotSchema>;
