## incursion.ts

**Purpose:** The `universe_incursion` table — ESI-fed cache of active incursions, refreshed every ~5 min.
**File:** `src/db/schema/universe/incursion.ts`

---

### universeIncursion
`pgTable('universe_incursion', …)`:
- `constellation_id` — `integer` PK, FK → `universe_constellation.id` `ON DELETE CASCADE`. One row per incursion constellation.
- `faction_id` — `bigint`, nullable. The incursion's NPC faction (e.g. Sansha's Nation).
- `staging_solar_system_id` — `integer`, nullable. The staging system.
- `has_boss` — `boolean`, not null.
- `influence` — `double precision`, not null. 0–1.
- `state` — `text`, not null (`mobilizing` | `established` | `withdrawing`).
- `type` — `text`, not null.
- `infested_solar_systems` — `jsonb` (`number[]`), not null. EVE solar-system ids infested by this incursion.

### Notes
- **Mutable ESI cache, not static SDE** — lives beside the static `universe_*` tables like `universe_sovereignty_map`. Full-replaced each run by the `incursion-refresh` job (`src/lib/jobs/tasks/incursionRefresh.ts`); active incursions are few and short-lived.
- The read-side intel module (`src/lib/map/intel.ts`) maps a system to its incursion via `infested_solar_systems` (and `staging_solar_system_id`).
