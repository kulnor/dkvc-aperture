## mapPurge.ts

**Purpose:** Daily cron at EVE downtime that hard-deletes `ap_map` rows whose two-phase soft-delete window has elapsed.
**File:** `src/lib/jobs/tasks/mapPurge.ts`

---

### mapPurge: JobModule
- `name`: `'map-purge'`
- `cron`: `'0 11 * * *'` (11:00 UTC, EVE downtime).
- `run`: `withInstrumentation('map-purge', purge)`.

### purge(): { deleted }
`DELETE FROM ap_map WHERE deleted_at IS NOT NULL AND deleted_at < now() - 30 days` (`MAP_PURGE_GRACE_DAYS`). `ON DELETE CASCADE` from `ap_map.id` removes `ap_map_system`, `ap_map_connection`, `ap_map_signature`, `ap_map_event`, and per-map webhook config in one DDL operation.

### Notes
- **No `ap_map_event` write, no `pg_notify`.** The map is already soft-deleted; no client tabs are subscribed; the cascade removes the audit history with the rest. This is the one housekeeping job that intentionally bypasses `commitMapEvent`.
- `ON DELETE CASCADE` propagates into all partitions, including `ap_map_event`'s monthly children (Postgres 14+).
- Picks the EVE-downtime cron slot deliberately: bulk DDL is cheapest when nobody is using the app.
