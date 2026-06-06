## hubProximity.ts

**Purpose:** SDE post-processing step that precomputes each high-sec system's nearest trade hub (high-sec-only gate route, within the hub's radius) onto `universe_system`.
**File:** `src/lib/sde/hubProximity.ts`

---

### computeHubProximity(): Promise<number>
Recomputes `universe_system.nearest_trade_hub_id` / `nearest_trade_hub_jumps` for every system. Loads the set of HS systems (`security = 'H'`), clears all systems' hub columns, builds a **high-sec-only** gate subgraph via `loadGateGraph(hsSet)`, BFSes once per hub in `apertureConfig.ROUTE_HUBS`, then assigns each HS system the nearest hub whose distance is `>= 1` and `<= hub.proximityJumps`. Distance 0 (the hub itself) is skipped. Systems reachable from a hub only via low/null-sec stay null.

Writes are batched: qualifying systems are grouped by (hubId, jumps) and updated with one `inArray` UPDATE per distinct pairing (≤ ~50 statements).

**Returns:** the number of systems assigned a hub.

**Called by:** `runIngest()` in `src/lib/sde/ingest.ts` (after stargate edges), recorded as `counts.hubProximity`.

### Depends on
- `@/db/client` (`db`), `@/db/schema` (`universeSystem`), `@/lib/map/gateGraph` (`loadGateGraph`, `bfs`), `aperture.config` (`ROUTE_HUBS`).
