// NB: no `import 'server-only'` here — unlike most server modules this one is
// imported by the graphile-worker tasks (sov-fw-refresh, incursion-refresh),
// which run under bare tsx in the job runner, not the Next.js bundler. The
// `server-only` poison-pill can't resolve there.
import { and, gt, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { universeEntityName } from '@/db/schema';
import { esiCall } from '@/lib/esi/client';
import { universeNamesSchema } from '@/lib/esi/decoders';

/**
 * Read/write helpers for the `universe_entity_name` cache. The read-side intel
 * module resolves faction/alliance/corporation ids → names through here so the
 * map page never hits ESI per render; the refresh jobs warm the cache, resolving
 * only ids that are missing or stale.
 */

// Names older than this are re-resolved on the next job pass. Factions are
// effectively static; alliances/corps rename occasionally.
export const ENTITY_NAME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// `post_universe_names` caps the request body at 1000 ids.
const NAMES_CHUNK = 1000;

// Only entity kinds the intel module displays are cached; `getUniverseNames` can
// return other categories (e.g. inventory_type) we don't want here.
const KEPT_CATEGORIES = new Set(['faction', 'alliance', 'corporation']);

/**
 * Cached names for `ids`, keyed by id, regardless of age. The display path
 * (`intelForSystems`) calls this and never hits ESI — a slightly-stale name is
 * fine to show, and ids absent from the cache fall back to their raw id in the UI.
 */
export async function cachedEntityNames(ids: number[]): Promise<Map<number, string>> {
  const unique = dedupeBigInts(ids);
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: universeEntityName.id, name: universeEntityName.name })
    .from(universeEntityName)
    .where(inArray(universeEntityName.id, unique));
  const out = new Map<number, string>();
  for (const r of rows) out.set(Number(r.id), r.name);
  return out;
}

/**
 * Resolve and cache only the `ids` missing or older than `ENTITY_NAME_TTL_MS`,
 * leaving fresh rows untouched. Called by the refresh jobs after they upsert the
 * sov/FW/incursion rows the ids came from. Best-effort: an ESI failure is
 * swallowed (the display path falls back to raw ids) so it never fails the job.
 */
export async function resolveStaleEntityNames(ids: number[]): Promise<void> {
  const unique = dedupeBigInts(ids);
  if (unique.length === 0) return;
  const cutoff = new Date(Date.now() - ENTITY_NAME_TTL_MS);
  const fresh = await db
    .select({ id: universeEntityName.id })
    .from(universeEntityName)
    .where(and(inArray(universeEntityName.id, unique), gt(universeEntityName.lastFetchedAt, cutoff)));
  const freshIds = new Set(fresh.map((r) => Number(r.id)));
  const missing = unique.map(Number).filter((id) => !freshIds.has(id));
  if (missing.length === 0) return;

  const resolved: { id: bigint; category: string; name: string }[] = [];
  try {
    for (let i = 0; i < missing.length; i += NAMES_CHUNK) {
      const chunk = missing.slice(i, i + NAMES_CHUNK);
      const names = await esiCall('getUniverseNames', { schema: universeNamesSchema, body: chunk });
      for (const n of names) {
        if (KEPT_CATEGORIES.has(n.category)) {
          resolved.push({ id: BigInt(n.id), category: n.category, name: n.name });
        }
      }
    }
  } catch {
    // Cache warming is best-effort; the UI degrades to raw ids until the next pass.
  }
  if (resolved.length === 0) return;
  await db
    .insert(universeEntityName)
    .values(resolved)
    .onConflictDoUpdate({
      target: universeEntityName.id,
      set: { name: sql`excluded.name`, category: sql`excluded.category`, lastFetchedAt: sql`now()` },
    });
}

function dedupeBigInts(ids: number[]): bigint[] {
  return Array.from(new Set(ids)).map((id) => BigInt(id));
}
