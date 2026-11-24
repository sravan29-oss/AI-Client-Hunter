import type { SchedulerConfig } from '../schedulerService';
import type { ProfileSnapshot } from '../idealProfileTypes';

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function calculateNextRun(config: SchedulerConfig, now = new Date(), consumed?: Date): Date | null {
  if (!config.enabled || config.scheduleMode === 'MANUAL') return null;
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const localTime = (time: number) => {
    const parts = Object.fromEntries(format.formatToParts(time).map(({ type, value }) => [type, Number(value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  };
  const day = 86400000;
  const localDay = Math.floor(localTime(now.getTime()) / day);
  const consumedDay = consumed && Math.floor(localTime(consumed.getTime()) / day);
  const [hours, minutes] = config.scheduledTime.split(':').map(Number);
  for (let offset = 0; offset <= 8; offset++) {
    const targetDay = localDay + offset;
    if (targetDay === consumedDay) continue;
    if (config.scheduleMode === 'WEEKLY' && new Date(targetDay * day).getUTCDay() !== 1) continue;
    const wallClock = targetDay * day + (hours * 60 + minutes) * 60000;
    // Check offsets on both sides of a DST transition. A nonexistent local time is skipped.
    const candidates = [wallClock - day, wallClock, wallClock + day]
      .map((sample) => wallClock - (localTime(sample) - sample))
      .filter((time) => time > now.getTime() && localTime(time) === wallClock);
    if (candidates.length) return new Date(Math.min(...candidates));
  }
  return null;
}

export interface DiscoverySegment {
  country: string;
  city: string | null;
  industry: string;
  providerUsed: string;
  profileSnapshot?: ProfileSnapshot | null;
}

const cityCountries = new Map(Object.entries({
  bengaluru: 'india', bangalore: 'india', mumbai: 'india', delhi: 'india',
  'new delhi': 'india', hyderabad: 'india', chennai: 'india', pune: 'india',
  'new york': 'united states', 'san francisco': 'united states', chicago: 'united states',
  london: 'united kingdom', manchester: 'united kingdom', toronto: 'canada',
  vancouver: 'canada', sydney: 'australia', melbourne: 'australia',
}));

export function selectSegment(config: SchedulerConfig, index: number): DiscoverySegment {
  const countries = config.targetCountries.length ? config.targetCountries : ['India'];
  const industries = config.targetIndustries.length ? config.targetIndustries : ['Local businesses'];
  const country = countries[index % countries.length];
  const round = Math.floor(index / countries.length);
  const industry = industries[round % industries.length];
  const cities = config.targetCities.flatMap((entry) => {
    const explicit = entry.match(/^(.+)\s+\(([^)]+)\)$/);
    const associated = explicit ? explicit[2].trim().toLowerCase() : cityCountries.get(entry.toLowerCase());
    if (associated === country.toLowerCase() || (!associated && countries.length === 1)) {
      return [explicit ? explicit[1].trim() : entry];
    }
    return [];
  });
  return { country, city: cities[round % cities.length] || null, industry, providerUsed: config.preferredProvider };
}
