## syncCharacterAuthz.ts

**Purpose:** Reconcile one character's derived authority state (`authz_level`, affiliations, corp-title role memberships) against ESI in a single transactional pass. Called from the Auth.js JWT callback on initial sign-in and the `character-cleanup` job's periodic resync.
**File:** `src/lib/auth/syncCharacterAuthz.ts`

---

### syncCharacterAuthz(characterId: bigint): Promise<SyncCharacterAuthzResult>

Pulls three ESI endpoints in parallel — `getCharacter`, `getCharacterRoles`, `getCharacterTitles` — then, when the character has an alliance, a follow-up `getAlliance`, then runs a single transaction that:

1. **Upserts `ap_corporation`** for the character's corp id (FK target for role rows + rights matrix). Refreshes `alliance_id` and `last_synced_at`; leaves `name` alone (filled by the dedicated corp-name resolver).
1b. **Upserts `ap_alliance`** when the character belongs to one — caches `name` + `executor_corporation_id` from `getAlliance`. This is the only writer of `ap_alliance`; the executor corp drives alliance-map authority in `canManageMap`.
2. **Updates `ap_character`** — sets `corporation_id`, `alliance_id`, `is_director`, `authz_synced_at`, and `authz_level` to the value returned by `resolveAuthzLevel({ characterId, isDirector })` (`src/lib/auth/resolveAuthz.ts`). `is_director` is the raw ESI Director bit (carries corp/alliance map authority in the derived model), distinct from `authz_level`. The level is a deterministic cache written verbatim every pass: any Director ⇒ corp-scoped `'manager'` (instance ownership is irrelevant); global `'admin'` only from an explicit `ap_access_grant` `capability='admin'`. There is no `CASE` preserve-hack — the resolver, not a sticky column, is what keeps explicit grants across resyncs.
3. **Reconciles `ap_character_role` rows with `source='corp_title'`** — upserts an `ap_role` per ESI title (`external_ref='<corp_id>:<title_id>'`), inserts memberships for newly held titles, deletes memberships for titles no longer returned by ESI. Built-in / external (Discord) role grants are untouched.

**ESI failures (`EsiBreakerOpenError`, `EsiDowntimeError`, `EsiTokenError`, `EsiHttpError`)** cause the function to return `{ applied: false, skipped: <reason> }` *before* touching the DB. Unexpected errors propagate to the caller.

**Returns** `SyncCharacterAuthzResult`:
- `authzLevel` — `'member' | 'manager' | 'admin'`, the exact value written to the row (the `resolveAuthzLevel` result; reflects explicit grants).
- `isDirector` — whether the Director role was present (also persisted to `ap_character.is_director`).
- `corporationId`, `allianceId` — the affiliations written.
- `executorCorporationId` — the alliance's executor corp from the `ap_alliance` upsert; `null` when unaffiliated.
- `titleCount` — number of `corp_title` roles reconciled.
- `applied` — `true` if the DB was updated; `false` with a `skipped` reason if ESI was unreachable.

### Depends On
- ESI: `getCharacter`, `getCharacterRoles`, `getCharacterTitles`, `getAlliance` via `esiCall`.
- `resolveAuthzLevel` (`src/lib/auth/resolveAuthz.ts`) — computes the cached `authz_level`.
- Schema: `ap_character`, `ap_corporation`, `ap_alliance`, `ap_role`, `ap_character_role`; `ap_access_grant` (read indirectly via the resolver).
- Constants: `apertureConfig.AUTHZ_ADMIN_ROLE` (`'Director'`).

### Invariants
- A character with neither corp roles nor titles, and no explicit grant, ends up with `authz_level='member'` and no `corp_title` role rows.
- A character whose Director role is removed in-game demotes from `manager` to `member` on the next sync (unless an explicit grant holds them higher) — derived authority is **not sticky**.
- A hand-assigned `manage`/`admin` grant survives every resync because the resolver re-reads it each pass — not because the column is preserved.
- ESI failure never leaves a partial sync — the transaction either runs to completion or no DB write happens.
