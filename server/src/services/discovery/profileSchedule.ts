import { locationKey, type ProfileLocation } from '../idealProfileTypes';
import { snapshotProfile, type SavedIdealProfile } from '../idealClientProfiles';
import type { SchedulerConfig } from '../schedulerService';
import { BadRequestError } from '../../utils/errors';
import type { DiscoverySegment } from './discoverySchedule';
import { canSearchGoogleNearby } from './providers/GooglePlacesProvider';

export function profileSchedules(profile: SavedIdealProfile, config: SchedulerConfig) {
  return profile.targeting.locations.map((location) => {
    const schedule = location.schedule;
    const effective = schedule ? { ...config, scheduleMode: schedule.mode, scheduledTime: schedule.time, timezone: schedule.timezone } : config;
    const signature = JSON.stringify([profile.activatedAt?.toISOString(), effective.scheduleMode, effective.scheduledTime, effective.timezone]);
    return { location, key: locationKey(location), schedule: effective, signature };
  });
}

export function profileSegment(profile: SavedIdealProfile, config: SchedulerConfig, location: ProfileLocation, sequence: number, due?: Date): DiscoverySegment {
  const industry = profile.targeting.industries[sequence % profile.targeting.industries.length];
  const profileSnapshot = snapshotProfile(profile, location, due);
  return {
    country: location.country,
    city: location.city || null,
    industry,
    providerUsed: location.radius && !(config.preferredProvider === 'google_places' && canSearchGoogleNearby({ industry, profileSnapshot })) ? 'overpass' : config.preferredProvider,
    profileSnapshot,
  };
}

export function manualProfileSegment(profile: SavedIdealProfile, config: SchedulerConfig, sequence: number, requested?: string): DiscoverySegment {
  const locations = profile.targeting.locations;
  const location = requested ? locations.find((place) => locationKey(place) === requested) : locations[sequence % locations.length];
  if (!location) throw new BadRequestError('Choose a location from the active Ideal Client Profile.');
  return profileSegment(profile, config, location, requested ? sequence : Math.floor(sequence / locations.length));
}

