import { z } from 'zod';

export const osmObjectSchema = z.object({
  type: z.enum(['node', 'way', 'relation']),
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export type OsmObject = z.infer<typeof osmObjectSchema>;

export function osmIdentityKey(object?: OsmObject): string | undefined {
  return object && `osm:${object.type}/${object.id}`;
}
