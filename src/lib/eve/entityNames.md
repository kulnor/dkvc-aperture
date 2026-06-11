## entityNames.ts

**Purpose:** Read/write helpers for the `universe_entity_name` cache — resolves faction/alliance/corporation ids → names for the intel module without hitting ESI per render.
**File:** `src/lib/eve/entityNames.ts`

---

### ENTITY_NAME_TTL_MS
Constant (7 days). Names older than this are re-resolved on the next job pass.

---

### cachedEntityNames(ids: number[]): Promise<Map<number, string>>
Cached names for `ids`, keyed by id, **regardless of age**. The display path (`intelForSystems`) calls this; it never hits ESI. Ids absent from the cache are simply missing from the map (the UI falls back to the raw id).

---

### resolveStaleEntityNames(ids: number[]): Promise<void>
Resolves and caches only the `ids` missing or older than `ENTITY_NAME_TTL_MS`, leaving fresh rows untouched. Called by the `sov-fw-refresh` and `incursion-refresh` jobs after they upsert the rows the ids came from. Batches `getUniverseNames` at ≤1000 ids/call, keeps only `faction`/`alliance`/`corporation` categories, and upserts. **Best-effort** — an ESI failure is swallowed so it never fails the calling job.
