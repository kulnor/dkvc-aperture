## intel.ts

**Purpose:** Builds per-system read-side intel for the map sidebar.
**File:** `src/lib/map/intel.ts`

---

### intelForSystems(systemIds: number[]): Promise<Record<number, SystemIntelSummary>>
Loads sovereignty, faction-warfare, and incursion state from the universe tables, resolves entity names from the `universe_entity_name` cache, fetches EVE-Scout connections once, and returns client-serialisable summaries keyed by solar-system id. Recent kills are **not** included here — the `SystemKillboardModule` owns that feed via `/api/system/[id]/killboard`.

Name resolution is a single cache read (`cachedEntityNames`) for every faction/alliance/corp id across the visible systems' sov/FW/incursion rows — **no ESI per render** (the refresh jobs warm the cache). Ids missing from the cache fall back to their raw id in the UI. Incursions are mapped to systems via `infested_solar_systems` (plus `staging_solar_system_id`); `isStaging` flags the staging system.

External EVE-Scout failures degrade to an empty list so the map still renders; the scheduled ESI refresh jobs remain the hard-failing path for sov/FW/incursion health.

**Parameters:**
- `systemIds` - EVE solar-system ids visible in the map view.

**Returns:** Per-system sovereignty (with resolved faction/alliance/corp names + logos), FW (with resolved faction names, contested state, victory %), incursion (state/influence/faction/has-boss/staging), EVE-Scout, and external-link summaries.
