## character.ts

**Purpose:** The `ap_character` table — one row per EVE character, holding membership, moderation state, authority level, and the encrypted ESI token set.
**File:** `src/db/schema/ap/character.ts`

---

### apCharacter
`pgTable('ap_character', …)`:
- `id` — `bigint` PK, the EVE character id (natural 64-bit key, not generated).
- `user_id` — `integer` FK → `ap_user.id` `ON DELETE CASCADE`.
- `name`, `owner_hash` — display name and CCP account-ownership hash (rotates on character transfer; canonical "same character" signal).
- `corporation_id`, `alliance_id` — nullable `bigint`. No FK to `ap_corporation`/`ap_alliance`.
- `esi_access_token`, `esi_refresh_token` — `text`, **AES-256-GCM ciphertext blobs** from `src/lib/crypto.ts`. Never plaintext.
- `esi_access_token_expires` — `timestamptz`.
- `esi_scopes` — `text[]`.
- `status` — `character_status` enum, default `active`; `status_changed_at` / `status_reason` accompany it.
- `status_expires_at` — `timestamptz`, nullable. Set on `kicked` rows to the moment the timeout ends; the `character-cleanup` cron flips `status` back to `active` and clears this column when `now() >= status_expires_at`. NULL on `active` / `banned` rows.
- `authz_level` — `authz_level` enum, default `member`. Derived state: `syncCharacterAuthz` sets `admin` ↔ `member` based on whether ESI returns the `Director` corp role; `manager` is reserved for explicit admin-panel grants and is never auto-overwritten.
- `is_director` — `boolean`, default `false`. The EVE corporation "Director" role, refreshed from ESI on every `syncCharacterAuthz` pass. Carries corp/alliance map-management authority in the derived-authority model (`canManageMap` / `canCreateMapOfType` in `src/lib/auth/rights.ts`); distinct from `authz_level` (the instance-operator tier).
- `authz_synced_at` — `timestamptz`, nullable. When `syncCharacterAuthz` last reconciled `authz_level`, `is_director`, and `ap_character_role` membership against ESI. Used by the `character-cleanup` job to throttle resync to stale rows.
- `last_system_id`, `last_ship_type_id` — `integer`, nullable. Last-known location state cached by the `location-poll` job. No FK to `universe_system` / `universe_type` — a universe rebuild would otherwise have to honour every stale pointer, and the next poll tick overwrites the value anyway.
- `last_ship_name` — `text`, nullable. The pilot's custom ship name (ESI `getCharacterShip.ship_name`) — what the player named this hull, not its type. Cached by the poll alongside `last_ship_type_id`; shown in the presence hover panel.
- `last_online` — `boolean`, nullable. Most recent `getCharacterOnline` result; `NULL` before the first poll tick.
- `last_location_at` — `timestamptz`, nullable. When `last_system_id` was last refreshed; stale when the character is offline (offline ticks update only `last_online`).
- `created_at` / `updated_at` — `timestamptz`, default `now()`.

Tracking is now **per-map**, not a per-character flag: a row in `ap_map_character_tracking` `(map_id, character_id)` means "track this character on this map." There is no `tracking_enabled` column — the join table is the single source of truth. See `src/lib/jobs/tracking.ts` and `src/db/schema/ap/map_tracking_seed.ts`.

The persisted refresh-token rotation invariant writes `esi_refresh_token` here **before** the rotated access token is returned to any caller — see `src/lib/auth/eve-provider.ts`.
