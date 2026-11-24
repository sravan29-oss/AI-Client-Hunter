import { randomUUID } from 'node:crypto';
import { Prisma, type Lead } from '@prisma/client';
import { isDatabaseConnected, memoryStore, prisma } from './prisma';
import { extractDomain } from '../utils/domain';
import { ConflictError, NotFoundError } from '../utils/errors';
import { osmIdentityKey, type OsmObject } from '../utils/osmObject';
import { normalizedLabel } from '../services/idealProfileTypes';

export interface DiscoveryObservation {
  providerId: string;
  reference?: string;
  sourceUrl?: string;
  address?: string;
  discoveryDate: string;
}

type DiscoveryIdentity = { osmObject?: OsmObject; observation?: DiscoveryObservation };
export type LeadIdentityInput = Pick<Prisma.LeadUncheckedCreateInput, 'businessName' | 'website' | 'country' | 'businessEmail'> & DiscoveryIdentity;

export function leadIdentityKeys(data: LeadIdentityInput): string[] {
  const domain = extractDomain(data.website);
  const email = data.businessEmail?.trim().toLowerCase();
  const name = data.businessName.trim().toLowerCase().replace(/\s+/g, ' ');
  const country = (data.country === undefined ? 'India' : data.country || '').trim().toLowerCase();
  const address = normalizedLabel(data.observation?.address ?? '');
  const provider = data.observation?.providerId;
  const reference = data.observation?.reference;
  const providerKey = provider && reference ? 'provider:' + JSON.stringify([provider, reference]) : null;
  const locationKey = address ? 'address:' + JSON.stringify([normalizedLabel(name), address, country]) : null;
  return [osmIdentityKey(data.osmObject), providerKey, locationKey, domain && 'domain:' + domain, email && 'email:' + email,
    !address && name && 'name:' + JSON.stringify([name, country])]
    .filter((key): key is string => Boolean(key));
}

function findMemoryIdentity(keys: string[]) {
  for (const key of keys) {
    const lead = memoryStore.leads.find((item) => item.osmIdentityKeys?.includes(key) || leadIdentityKeys(item).includes(key));
    if (lead) return lead;
  }
  return null;
}

export async function rememberOsmIdentity(id: string, object?: OsmObject, tx: Prisma.TransactionClient = prisma) {
  const key = osmIdentityKey(object);
  if (!key) return;
  if (!isDatabaseConnected) {
    if (findMemoryIdentity([key])) return;
    const lead = memoryStore.leads.find((item) => item.id === id);
    if (lead) lead.osmIdentityKeys = [...(lead.osmIdentityKeys ?? []), key];
    return;
  }
  await lockKeys(tx, [key]);
  await tx.$executeRaw`INSERT INTO "LeadIdentity" ("key", "leadId") VALUES (${key}, ${id}) ON CONFLICT ("key") DO NOTHING`;
}

async function lockKeys(tx: Prisma.TransactionClient, keys: string[]) {
  for (const key of [...new Set(keys)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 5071))`;
  }
}

export async function findLeadByIdentity(data: LeadIdentityInput, tx: Prisma.TransactionClient = prisma): Promise<Lead | null> {
  const keys = leadIdentityKeys(data);
  if (!keys.length) return null;
  if (!isDatabaseConnected) {
    return findMemoryIdentity(keys);
  }
  const matches = await tx.$queryRaw<Array<{ key: string; leadId: string }>>`
    SELECT "key", "leadId" FROM "LeadIdentity" WHERE "key" IN (${Prisma.join(keys)})
  `;
  const match = keys.map((key) => matches.find((row) => row.key === key)).find(Boolean);
  return match ? tx.lead.findUnique({ where: { id: match.leadId } }) : null;
}

async function insertIdentities(tx: Prisma.TransactionClient, keys: string[], id: string) {
  if (!keys.length) return;
  await tx.$executeRaw`
    INSERT INTO "LeadIdentity" ("key", "leadId")
    VALUES ${Prisma.join(keys.map((key) => Prisma.sql`(${key}, ${id})`))}
  `;
}

async function recordObservation(db: Prisma.TransactionClient, leadId: string, data: LeadIdentityInput, keys: string[]) {
  const observation = data.observation;
  if (!observation) return;
  const reference = observation.reference || keys.find((key) => key.startsWith('address:')) || keys.find((key) => key.startsWith('domain:'));
  if (!reference) return;
  const discoveredAt = new Date(observation.discoveryDate);
  const { providerId, sourceUrl } = observation;
  await db.$executeRaw`
    INSERT INTO "LeadDiscoverySource" ("leadId", "providerId", "reference", "sourceUrl", "firstDiscoveredAt", "lastDiscoveredAt")
    VALUES (${leadId}, ${providerId}, ${reference}, ${sourceUrl ?? null}, ${discoveredAt}, ${discoveredAt})
    ON CONFLICT ("leadId", "providerId", "reference") DO UPDATE SET
      "lastDiscoveredAt" = GREATEST("LeadDiscoverySource"."lastDiscoveredAt", EXCLUDED."lastDiscoveredAt"),
      "sourceUrl" = COALESCE(EXCLUDED."sourceUrl", "LeadDiscoverySource"."sourceUrl")
  `;
}

async function linkDuplicate(db: Prisma.TransactionClient, lead: Lead, data: LeadIdentityInput, keys: string[]) {
  if (!data.observation) {
    await rememberOsmIdentity(lead.id, data.osmObject, db);
    return;
  }
  if (keys.length) await db.$executeRaw`
    INSERT INTO "LeadIdentity" ("key", "leadId")
    VALUES ${Prisma.join(keys.map((key) => Prisma.sql`(${key}, ${lead.id})`))}
    ON CONFLICT ("key") DO NOTHING
  `;
  await recordObservation(db, lead.id, data, keys);
  await db.lead.updateMany({ where: { id: lead.id }, data: { lastSeenAt: new Date() } });
}

export async function rememberDuplicateDiscovery(data: LeadIdentityInput, tx: Prisma.TransactionClient) {
  const keys = leadIdentityKeys(data);
  await lockKeys(tx, keys);
  const existing = await findLeadByIdentity(data, tx);
  if (!existing) return false;
  await linkDuplicate(tx, existing, data, keys);
  return true;
}

export async function createOrFindLead(data: Prisma.LeadUncheckedCreateInput & DiscoveryIdentity, tx?: Prisma.TransactionClient): Promise<{ lead: Lead; created: boolean }> {
  const { osmObject, observation: _observation, ...leadData } = data;
  if (!isDatabaseConnected) {
    const keys = leadIdentityKeys(data);
    const existing = findMemoryIdentity(keys);
    if (existing) {
      await rememberOsmIdentity(existing.id, osmObject);
      return { lead: existing, created: false };
    }
    const now = new Date();
    const lead = { id: randomUUID(), createdAt: now, updatedAt: now, audits: [], pitches: [], ...data };
    memoryStore.leads.unshift(lead);
    return { lead: lead as Lead, created: true };
  }

  const write = async (db: Prisma.TransactionClient) => {
    const keys = leadIdentityKeys(data);
    await lockKeys(db, keys);
    const existing = await findLeadByIdentity(data, db);
    if (existing) {
      await linkDuplicate(db, existing, data, keys);
      return { lead: existing, created: false };
    }
    const lead = await db.lead.create({ data: leadData });
    await insertIdentities(db, keys, lead.id);
    await recordObservation(db, lead.id, data, keys);
    return { lead, created: true };
  };

  return tx ? write(tx) : prisma.$transaction(write, { timeout: 15000 });
}

function identityChanged(payload: Partial<LeadIdentityInput>) {
  return ['businessName', 'website', 'businessEmail', 'country'].some((field) => Object.hasOwn(payload, field));
}

export async function updateLeadWithIdentity(
  id: string,
  data: Partial<LeadIdentityInput> & Prisma.LeadUncheckedUpdateInput,
  recordUpdate?: (tx: Prisma.TransactionClient, existing: Lead, updated: Lead) => Promise<void>,
) {
  if (!isDatabaseConnected) {
    const existing = memoryStore.leads.find((lead) => lead.id === id);
    if (!existing) throw new NotFoundError('Lead not found.');
    const next = { ...existing, ...data };
    if (identityChanged(data)) {
      const previousKeys = leadIdentityKeys(existing);
      const added = leadIdentityKeys(next).filter((key) => !previousKeys.includes(key));
      const conflict = memoryStore.leads.find((lead) => lead.id !== id && leadIdentityKeys(lead).some((key) => added.includes(key)));
      if (conflict) throw new ConflictError('Another lead owns this business identity.', { existingLeadId: conflict.id });
    }
    const updated = { ...next, updatedAt: new Date() };
    memoryStore.leads[memoryStore.leads.indexOf(existing)] = updated;
    return { existing, updated };
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Lead" WHERE "id" = ${id} FOR UPDATE`;
    const existing = await tx.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Lead not found.');
    if (identityChanged(data)) {
      const oldKeys = leadIdentityKeys(existing);
      const newKeys = leadIdentityKeys({ ...existing, ...data });
      const added = newKeys.filter((key) => !oldKeys.includes(key));
      const removed = oldKeys.filter((key) => !newKeys.includes(key));
      await lockKeys(tx, [...added, ...removed]);
      if (added.length) {
        const [conflict] = await tx.$queryRaw<Array<{ leadId: string }>>`
          SELECT "leadId" FROM "LeadIdentity" WHERE "key" IN (${Prisma.join(added)}) AND "leadId" <> ${id} LIMIT 1
        `;
        if (conflict) throw new ConflictError('Another lead owns this business identity.', { existingLeadId: conflict.leadId });
        await insertIdentities(tx, added, id);
      }
      if (removed.length) {
        await tx.$executeRaw`DELETE FROM "LeadIdentity" WHERE "leadId" = ${id} AND "key" IN (${Prisma.join(removed)})`;
      }
    }
    const updated = await tx.lead.update({ where: { id }, data });
    await recordUpdate?.(tx, existing, updated);
    return { existing, updated };
  });
}
