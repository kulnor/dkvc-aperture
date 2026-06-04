import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { apertureConfig } from '../../../aperture.config';
import { db } from '@/db/client';
import { apMapSystem } from '@/db/schema';

/**
 * Server-side broadcaster for a user-initiated system "ping" — a transient
 * attention pulse a player fires to draw eyes to a system without the
 * commitment of a rally point.
 *
 * Like `characterUpdate` / `systemNotification` (zKB) it carries no `MapViewData`
 * state, so it deliberately **bypasses `ap_map_event`** and fans out with a
 * direct `pg_notify` on the `map:<id>` channel under the `systemNotification`
 * task (kind `ping`). The bus discriminates on the top-level `task` field; every
 * subscriber — the initiator included — pulses the node via `MapUnderglowBridge`.
 *
 * The caller passes `ap_map_system.id`; we resolve it to the EVE solar-system id
 * the wire carries and verify it belongs to `mapId` in the same query, so a
 * client can't ping a system that isn't on the map it has access to.
 */
export async function pingSystem(args: {
  mapId: bigint;
  mapSystemId: bigint;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select({ systemId: apMapSystem.systemId })
    .from(apMapSystem)
    .where(and(eq(apMapSystem.id, args.mapSystemId), eq(apMapSystem.mapId, args.mapId)));
  if (!row) return { ok: false, error: 'System is not on this map.' };

  const channel = `${apertureConfig.MAP_EVENT_NOTIFY_CHANNEL_PREFIX}${args.mapId.toString()}`;
  const envelope = JSON.stringify({
    task: 'systemNotification',
    load: { mapId: Number(args.mapId), systemId: row.systemId, kind: 'ping' },
  });
  await db.execute(sql`SELECT pg_notify(${channel}, ${envelope})`);
  return { ok: true };
}
