import type { IdealClientProfile, Prisma } from '@prisma/client';
import { isDatabaseConnected, prisma } from '../db/prisma';
import { AppError, ConflictError, NotFoundError } from '../utils/errors';
import { locationKey, targetingSchema, type IdealProfileInput, type IdealProfileTargeting, type ProfileLocation, type ProfileSnapshot } from './idealProfileTypes';

export type SavedIdealProfile = Omit<IdealClientProfile, 'targeting'> & { targeting: IdealProfileTargeting };

function readProfile(row: IdealClientProfile): SavedIdealProfile {
  return { ...row, targeting: targetingSchema.parse(row.targeting) };
}

function requireDatabase() {
  if (!isDatabaseConnected) throw new AppError('Connect PostgreSQL to save Ideal Client Profiles.', 503);
}

async function checkedProfile(tx: Prisma.TransactionClient, id: string, revision: number) {
  const [row] = await tx.$queryRaw<IdealClientProfile[]>`SELECT * FROM "IdealClientProfile" WHERE "id" = ${id} FOR UPDATE`;
  if (!row) throw new NotFoundError('Ideal Client Profile not found.');
  if (row.revision !== revision) throw new ConflictError('The profile changed. Reload it before saving.');
  return row;
}

async function audit(tx: Prisma.TransactionClient, id: string, action: string, description: string) {
  await tx.activityLog.create({ data: { action, description, metadata: { profileId: id } } });
}

export async function listIdealProfiles() {
  requireDatabase();
  return (await prisma.idealClientProfile.findMany({ orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }] })).map(readProfile);
}

export async function createIdealProfile(input: IdealProfileInput) {
  requireDatabase();
  return prisma.$transaction(async (tx) => {
    const row = await tx.idealClientProfile.create({ data: input });
    await audit(tx, row.id, 'IDEAL_PROFILE_CREATED', 'Created an Ideal Client Profile.');
    return readProfile(row);
  });
}

export async function saveIdealProfile(id: string, revision: number, input: IdealProfileInput) {
  requireDatabase();
  return prisma.$transaction(async (tx) => {
    await checkedProfile(tx, id, revision);
    const row = await tx.idealClientProfile.update({ where: { id }, data: { ...input, revision: { increment: 1 } } });
    await tx.profileScheduleCursor.deleteMany({ where: { profileId: id, locationKey: { notIn: input.targeting.locations.map(locationKey) } } });
    await audit(tx, row.id, 'IDEAL_PROFILE_UPDATED', 'Updated an Ideal Client Profile.');
    return readProfile(row);
  });
}

export async function duplicateIdealProfile(id: string, revision: number, name: string) {
  requireDatabase();
  return prisma.$transaction(async (tx) => {
    const source = await checkedProfile(tx, id, revision);
    const row = await tx.idealClientProfile.create({ data: { name, targeting: readProfile(source).targeting } });
    await audit(tx, row.id, 'IDEAL_PROFILE_DUPLICATED', 'Duplicated an Ideal Client Profile.');
    return readProfile(row);
  });
}

export async function setActiveIdealProfile(id: string, revision: number, active: boolean) {
  requireDatabase();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(652483941)`;
    const previous = await checkedProfile(tx, id, revision);
    if (previous.active === active) return readProfile(previous);
    if (active) {
      await tx.idealClientProfile.updateMany({ where: { active: true }, data: { active: false, revision: { increment: 1 } } });
    }
    const row = await tx.idealClientProfile.update({
      where: { id }, data: { active, activatedAt: active ? new Date() : previous.activatedAt, revision: { increment: 1 } },
    });
    await audit(tx, row.id, active ? 'IDEAL_PROFILE_ACTIVATED' : 'IDEAL_PROFILE_DEACTIVATED', active ? 'Activated an Ideal Client Profile.' : 'Deactivated an Ideal Client Profile.');
    return readProfile(row);
  });
}

export async function getActiveIdealProfile(tx: Prisma.TransactionClient = prisma, lock = false) {
  if (!isDatabaseConnected) return null;
  const row = lock
    ? (await tx.$queryRaw<IdealClientProfile[]>`SELECT * FROM "IdealClientProfile" WHERE "active" FOR SHARE`)[0]
    : await tx.idealClientProfile.findFirst({ where: { active: true } });
  return row ? readProfile(row) : null;
}

export function snapshotProfile(profile: SavedIdealProfile, location: ProfileLocation, due?: Date): ProfileSnapshot {
  const { locations: _locations, ...targeting } = profile.targeting;
  return { profileId: profile.id, profileName: profile.name, revision: profile.revision, location, targeting, scheduledFor: due?.toISOString() ?? null };
}

export async function profileIsCurrent(snapshot: ProfileSnapshot, tx: Prisma.TransactionClient = prisma, lock = false) {
  const current = await getActiveIdealProfile(tx, lock);
  return current?.id === snapshot.profileId && current.revision === snapshot.revision;
}
