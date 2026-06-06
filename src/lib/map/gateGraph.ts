// No `import 'server-only'`: consumed both by server-component code (via
// `route.ts`, which carries the guard) and by job code that runs under plain
// Node (`src/lib/sde/hubProximity.ts`, called from the SDE ingest job), which
// would crash on the `server-only/index.js` throw. Same precedent as
// `src/lib/map/systemNode.ts`.
import { db } from '@/db/client';
import { universeStargateEdge } from '@/db/schema';

/**
 * Bidirectional gate adjacency from `universe_stargate_edge`.
 *
 * Stargates are treated as undirected — both directions are indexed so a
 * single-direction SDE row doesn't break traversal.
 *
 * When `restrictToSystems` is given, only edges whose **both** endpoints are in
 * the set are kept, yielding a subgraph (e.g. high-sec-only routing). Systems
 * outside the set become unreachable.
 */
export async function loadGateGraph(
  restrictToSystems?: ReadonlySet<number>,
): Promise<Map<number, number[]>> {
  const edges = await db
    .select({ from: universeStargateEdge.fromSystemId, to: universeStargateEdge.toSystemId })
    .from(universeStargateEdge);
  const adjacency = new Map<number, number[]>();
  for (const e of edges) {
    if (restrictToSystems && (!restrictToSystems.has(e.from) || !restrictToSystems.has(e.to))) {
      continue;
    }
    pushEdge(adjacency, e.from, e.to);
    pushEdge(adjacency, e.to, e.from);
  }
  return adjacency;
}

function pushEdge(adjacency: Map<number, number[]>, from: number, to: number): void {
  const list = adjacency.get(from);
  if (list) list.push(to);
  else adjacency.set(from, [to]);
}

/** Breadth-first gate-jump distances from `source` to every reachable system. */
export function bfs(adjacency: Map<number, number[]>, source: number): Map<number, number> {
  const dist = new Map<number, number>([[source, 0]]);
  const queue: number[] = [source];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const currentDist = dist.get(current)!;
    for (const next of adjacency.get(current) ?? []) {
      if (!dist.has(next)) {
        dist.set(next, currentDist + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}
