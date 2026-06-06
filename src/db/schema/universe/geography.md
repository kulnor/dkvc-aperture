## geography.ts

**Purpose:** Drizzle tables for EVE spatial hierarchy: regions, constellations, systems, and the directed stargate edge graph.
**File:** `src/db/schema/universe/geography.ts`

Exports: `universeRegion`, `universeConstellation`, `universeSystem`, `universeStargateEdge`.
See `src/db/schema.md` for the column/FK reference. Spatial IDs are `integer`; coords `doublePrecision`. `universeStargateEdge` PK is `(from_system_id, to_system_id)` with an index on `to_system_id` for reverse lookups.

`universeSystem` carries two **derived** (non-CCP) columns, recomputed each SDE ingest by `computeHubProximity` (`src/lib/sde/hubProximity.ts`):
- `nearestTradeHubId` (`nearest_trade_hub_id`) — nearest configured trade hub reachable via a high-sec-only gate route within the hub's proximity radius; nullable self-FK to `universe_system.id` `ON DELETE SET NULL`.
- `nearestTradeHubJumps` (`nearest_trade_hub_jumps`) — HS-only gate jumps to that hub; null together with the id when no hub qualifies.

Migration: `0037_trade_hub_proximity.sql`.
