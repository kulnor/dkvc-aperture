// NOTE: deliberately no `import 'server-only'` — reachable from the
// `character-cleanup` job task (bare `tsx`); mirrors the location-poll's raw
// `pg_notify` broadcast pattern rather than the `ap_map_event` trigger path.
import { sql } from 'drizzle-orm';
import { apertureConfig } from '../../../aperture.config';
import { db } from '@/db/client';

/**
 * Broadcast a `characterLogout` envelope on a map channel so every live viewer
 * drops the named pilots from the presence roster immediately.
 *
 * Like `characterUpdate` / `systemNotification`, this is a *transient*
 * server-observed signal that carries no `MapViewData` state, so it is published
 * by a direct `pg_notify('map:'||mapId, …)` that bypasses `ap_map_event` (the
 * bus discriminates on the top-level `task` field — see `src/lib/realtime/bus.ts`).
 *
 * Used by the access-revocation path (`character-cleanup` → `pruneTrackingForLostAccess`)
 * when a pilot loses view access to a map after leaving the owning corp/alliance.
 */
export async function broadcastCharacterLogout(
  mapId: bigint,
  characterIds: bigint[],
): Promise<void> {
  if (characterIds.length === 0) return;
  const envelope = JSON.stringify({
    task: 'characterLogout',
    load: { characterIds: characterIds.map(Number) },
  });
  const channel = `${apertureConfig.MAP_EVENT_NOTIFY_CHANNEL_PREFIX}${mapId.toString()}`;
  await db.execute(sql`SELECT pg_notify(${channel}, ${envelope})`);
}
