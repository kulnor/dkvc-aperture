## gateGraph.ts

**Purpose:** Shared gate-graph primitives — load the stargate adjacency from `universe_stargate_edge` and run BFS over it. Used by both the read-only route module and the SDE hub-proximity precompute.
**File:** `src/lib/map/gateGraph.ts`

---

### loadGateGraph(restrictToSystems?: ReadonlySet<number>): Promise<Map<number, number[]>>
Loads the full stargate edge table and builds a bidirectional adjacency map (system id → neighbor system ids). Stargates are treated as undirected; both directions are indexed defensively.

**Parameters:**
- `restrictToSystems` — when given, keeps only edges where **both** endpoints are in the set, producing a subgraph (e.g. high-sec-only). Systems outside the set become unreachable.

**Returns:** Adjacency map keyed by EVE solar-system id.

---

### bfs(adjacency: Map<number, number[]>, source: number): Map<number, number>
Standard breadth-first search yielding gate-jump distance from `source` to every reachable system. Distance to `source` is 0; unreachable systems are absent from the map.

### Notes
- **No `import 'server-only'`.** Used by both server components (via `route.ts`, which carries the guard) and job code under plain Node (`hubProximity.ts`, called from the SDE ingest job). Same precedent as `systemNode.ts`.

### Depends on
- `@/db/client` (`db`), `@/db/schema` (`universeStargateEdge`).
