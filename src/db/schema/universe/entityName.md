## entityName.ts

**Purpose:** The `universe_entity_name` table — a generic ESI-fed id→name cache for faction/alliance/corporation ids shown in the intel module.
**File:** `src/db/schema/universe/entityName.ts`

---

### universeEntityName
`pgTable('universe_entity_name', …)`:
- `id` — `bigint` PK, the natural EVE entity id (not generated).
- `category` — `text`, not null. `getUniverseNames` category (`faction` | `alliance` | `corporation`).
- `name` — `text`, not null. Last resolved name.
- `last_fetched_at` — `timestamptz`, default `now()`. Drives opportunistic re-resolution (ids fresher than the TTL are skipped).

### Notes
- **Mutable ESI cache, not static SDE.** Populated by the `sov-fw-refresh` and `incursion-refresh` jobs, which resolve only ids missing or older than the cache TTL — never a blind batch re-resolve. Read/write helpers in `src/lib/eve/entityNames.ts`.
- **Distinct from `universe_corporation`.** That cache backs the structure-owner FK and is corp-only; this one holds any displayed entity regardless of type.
