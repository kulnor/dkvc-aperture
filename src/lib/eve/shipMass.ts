// No `import 'server-only'`: reached by the location-poll job chain
// (tracking.ts → wsServer.ts), which the custom `server.ts` loads via tsx
// outside Next's bundler where the `server-only` shim doesn't resolve. Same
// precedent as `locationCommit.ts` / `bus.ts`. Server-only by usage.
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { universeType } from '@/db/schema';

/**
 * Ship mass resolution for the connection mass-log. A ship's
 * mass is the base `mass` column on `universe_type` (kg), not a dogma attribute —
 * only a handful of types carry a `mass` dogma attribute, so the attribute path
 * resolves to null for essentially every ship. (Wormhole stable/jump mass in
 * `wormholeJumpInfo.ts` genuinely are dogma attributes; this is not.)
 */

/** The ship's mass in kg, or null when the type is unknown or has no mass. */
export async function shipMass(typeId: number): Promise<number | null> {
  const [row] = await db
    .select({ mass: universeType.mass })
    .from(universeType)
    .where(eq(universeType.id, typeId));
  return row?.mass ?? null;
}

/** Batch variant — maps each requested typeId to its mass (kg) or null. */
export async function shipMassByType(typeIds: number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>(typeIds.map((id) => [id, null]));
  if (typeIds.length === 0) return out;
  const rows = await db
    .select({ id: universeType.id, mass: universeType.mass })
    .from(universeType)
    .where(inArray(universeType.id, typeIds));
  for (const r of rows) out.set(r.id, r.mass ?? null);
  return out;
}
