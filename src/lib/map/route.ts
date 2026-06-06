import 'server-only';
import { apertureConfig } from '../../../aperture.config';
import { bfs, loadGateGraph } from './gateGraph';

/** Gate-jump distance from one system to a single trade hub. */
export type HubRoute = {
  /** Hub solar-system id. */
  systemId: number;
  name: string;
  /** Gate jumps to the hub, or `null` when no gate route exists (e.g. wormhole space). */
  jumps: number | null;
};

/**
 * Gate-jump distance from each given system to every configured trade hub
 * (`apertureConfig.ROUTE_HUBS`), computed by BFS over `universe_stargate_edge`.
 *
 * One BFS per hub across the whole gate graph yields distances to all systems at
 * once, so this is called once per page load for every system on the map rather
 * than per system-click. Systems with no gate edges (wormhole space) get `null`.
 *
 * Result is keyed by EVE solar-system id; hubs are in `ROUTE_HUBS` display order.
 */
export async function routesForSystems(
  systemIds: number[],
): Promise<Record<number, HubRoute[]>> {
  const result: Record<number, HubRoute[]> = {};
  if (systemIds.length === 0) return result;

  const adjacency = await loadGateGraph();

  // distancesByHub[hubSystemId] = Map<systemId, jumps>
  const distancesByHub = new Map<number, Map<number, number>>();
  for (const hub of apertureConfig.ROUTE_HUBS) {
    distancesByHub.set(hub.systemId, bfs(adjacency, hub.systemId));
  }

  for (const systemId of systemIds) {
    result[systemId] = apertureConfig.ROUTE_HUBS.map((hub) => {
      const dist = distancesByHub.get(hub.systemId)?.get(systemId);
      return { systemId: hub.systemId, name: hub.name, jumps: dist ?? null };
    });
  }
  return result;
}

/** Gate-jump distances from a single system to every configured hub. */
export async function jumpsToHubs(systemId: number): Promise<HubRoute[]> {
  const all = await routesForSystems([systemId]);
  return all[systemId] ?? [];
}
