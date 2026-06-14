## alliance.ts

**Purpose:** The `ap_alliance` table — minimal alliance registry created on demand, caching `executor_corporation_id` to back the derived-authority model for alliance maps.
**File:** `src/db/schema/ap/alliance.ts`

---

### apAlliance
`pgTable('ap_alliance', …)`:
- `id` — `bigint` PK, the EVE alliance id (natural 64-bit key, not generated).
- `name` — `text`, required. Refreshed from ESI `getAlliance` whenever a member of the alliance is reconciled by `syncCharacterAuthz`.
- `executor_corporation_id` — `bigint`, nullable. The alliance's executor corp; its Directors are the ones allowed to create/manage alliance maps (`canManageMap`). NULL when the alliance has no executor (closed/dissolving).
- `last_synced_at` — `timestamptz`, default `now()`. When the row was last refreshed from ESI.

No `active` / `deleted_at` flag — mirrors `ap_corporation`; defunct alliances stay as historical record. Rows are upserted by `syncCharacterAuthz`; nothing else writes to this table.
