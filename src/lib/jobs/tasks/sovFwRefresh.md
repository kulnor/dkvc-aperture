## sovFwRefresh.ts

**Purpose:** Refreshes sovereignty and faction-warfare universe state from ESI.
**File:** `src/lib/jobs/tasks/sovFwRefresh.ts`

---

### sovFwRefresh
Graphile-worker job module named `sov-fw-refresh`, scheduled hourly at minute 30.

Fetches `getSovereigntyMap` and `getFactionWarSystems` through `esiCall`, filters out unknown / wormhole systems, upserts current k-space rows into `universe_sovereignty_map` and `universe_faction_war_system`, deletes stale rows, and returns count notes for `ap_job_run`.

After the upsert it warms the `universe_entity_name` cache for every sov/FW entity id (faction/alliance/corporation) via `resolveStaleEntityNames` (best-effort; resolves only missing/stale ids), so the intel module can show names instead of raw ids without hitting ESI per render.
