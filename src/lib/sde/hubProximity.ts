import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { universeSystem } from '@/db/schema';
import { bfs, loadGateGraph } from '@/lib/map/gateGraph';
import { apertureConfig } from '../../../aperture.config';

/**
 * Recompute each high-sec system's nearest trade hub and store it on
 * `universe_system` (`nearest_trade_hub_id`, `nearest_trade_hub_jumps`).
 *
 * "Nearest" is by gate jumps over a **high-sec-only** subgraph — every system on
 * the route, both endpoints included, must be HS — among the hubs in
 * `apertureConfig.ROUTE_HUBS` whose distance is within that hub's
 * `proximityJumps` radius. A system reachable only by dipping through low/null
 * gets no hub. The hubs themselves (distance 0) are skipped.
 *
 * Run at the tail of the SDE ingest, after stargate edges + system security are
 * loaded; CCP only changes the gate map on SDE bumps. All systems are cleared
 * first so a re-ingest after a map change drops stale values.
 *
 * **Returns:** the number of systems assigned a hub.
 */
export async function computeHubProximity(): Promise<number> {
  const hsRows = await db
    .select({ id: universeSystem.id })
    .from(universeSystem)
    .where(eq(universeSystem.security, 'H'));
  const hsSystemIds = new Set(hsRows.map((r) => r.id));

  // Clear every system first; only qualifying HS systems are re-set below.
  await db
    .update(universeSystem)
    .set({ nearestTradeHubId: null, nearestTradeHubJumps: null });

  const adjacency = await loadGateGraph(hsSystemIds);

  const distancesByHub = new Map<number, Map<number, number>>();
  for (const hub of apertureConfig.ROUTE_HUBS) {
    distancesByHub.set(hub.systemId, bfs(adjacency, hub.systemId));
  }

  // Group qualifying systems by (hubId, jumps) so each distinct pairing is one
  // bulk UPDATE rather than a write per system.
  const idsByAssignment = new Map<string, number[]>();
  for (const systemId of hsSystemIds) {
    let bestHubId: number | null = null;
    let bestJumps = Infinity;
    for (const hub of apertureConfig.ROUTE_HUBS) {
      const d = distancesByHub.get(hub.systemId)?.get(systemId);
      // d === 0 is the hub itself; it gets no badge.
      if (d != null && d >= 1 && d <= hub.proximityJumps && d < bestJumps) {
        bestHubId = hub.systemId;
        bestJumps = d;
      }
    }
    if (bestHubId == null) continue;
    const key = `${bestHubId}:${bestJumps}`;
    const list = idsByAssignment.get(key);
    if (list) list.push(systemId);
    else idsByAssignment.set(key, [systemId]);
  }

  let assigned = 0;
  for (const [key, ids] of idsByAssignment) {
    const [hubId, jumps] = key.split(':').map(Number);
    await db
      .update(universeSystem)
      .set({ nearestTradeHubId: hubId!, nearestTradeHubJumps: jumps! })
      .where(inArray(universeSystem.id, ids));
    assigned += ids.length;
  }

  return assigned;
}
