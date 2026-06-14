## rights.ts

**Purpose:** Server-side permission gate. One module every controller and read path imports to answer "can this authenticated character perform this action on this map". Management authority is the derived-authority model — a pure function of EVE state + ownership (`canManageMap`), not the (retired) corp-right matrix.
**File:** `src/lib/auth/rights.ts`

---

### View rule (in order)

1. **Admin** — `authz_level='admin'` always wins.
2. **Owner match** per `ap_map.type`:
   - `private`  → `owner_character_id` matches the actor's id.
   - `corp`     → `owner_corporation_id` matches the actor's `corporation_id`.
   - `alliance` → `owner_alliance_id` matches the actor's `alliance_id`.
3. **Role overlay** — any `ap_character_role` row whose role appears in `ap_map_role_access` for the target map grants view.
4. Otherwise no view.

### Mutate rule (derived authority)

Management authority is the binary `canManageMap` — admin, the private map's owner, the owning corp's Director, or the owning alliance's executor-corp Director. The corp-right matrix no longer participates and the role overlay never unlocks mutation (view only). The `MapRight` argument is retained on the mutate guards for the future title-delegation overlay (R4) but is ignored at the baseline — anyone who can manage the map can perform every per-map right.

**Unowned maps** (all three owner columns NULL) are admin-only. Defensive default that surfaces rows needing repair.

---

### canViewMap(characterId, mapId): Promise<boolean>
Returns `false` for non-existent / soft-deleted maps, kicked / banned characters, and anyone outside the view rule above.

### canMutateMap(characterId, mapId, right): Promise<boolean>
Delegates to `canManageMap` — `right` is accepted for the R4 overlay but ignored at the baseline. Throws if called with `'map_create'` (which has no target map; use `canCreateMap`).

### canCreateMap(characterId, type): Promise<boolean>
Typed create gate (derived authority). Admin → true. `private` → any active character. `corp` → `actor.is_director`. `alliance` → `actor.is_director && actor.corporation_id == executorCorpOf(actor.alliance_id)`. The caller resolves the owner FK from the actor's affiliation.

---

### Derived-authority model (permissions multi-tenant)

Map-management authority is a pure function of EVE state + ownership. This is the **live** mutate path: `canMutateMap` / `requireMapRight` / `assertMapRight` all resolve to `canManageMap`, and `canCreateMap` is the typed create gate. The corp-right matrix no longer participates.

#### executorCorpOf(allianceId): Promise<bigint | null>
The alliance's executor corporation from the `ap_alliance` cache (`syncCharacterAuthz` keeps it fresh). `null` when the alliance is unknown or has no executor.

#### canManageMap(characterId, mapId): Promise<boolean>
Binary "can the actor manage this map" (full mutation surface + settings/webhooks/audit; no per-right granularity at baseline). Admin → true. `private` → `owner_character_id == actor`. `corp` → `actor.is_director && owner_corporation_id == actor.corporation_id`. `alliance` → `actor.is_director && owner_alliance_id == actor.alliance_id && actor.corporation_id == executorCorpOf(owner_alliance_id)`. All-NULL owner / missing / inactive → false.

### isAdmin(session): Promise<boolean>
Cheap session-level admin probe — does not touch any map table.

### isManagerOrAdmin(session): Promise<boolean>
True iff the active character is `status='active'` AND `authz_level >= 'manager'`. The admin-panel layout gate (`/admin/*`). Returns `false` for kicked/banned characters even at manager level — defence in depth.

### adminVisibilityScope(session): Promise<AdminVisibilityScope | null>
Returns `{ kind: 'global' }` for admin, `{ kind: 'corp', corporationId, allianceId }` for an active manager with a non-null `corporation_id`, and `null` otherwise (member/none, kicked/banned, or manager with NULL corp). Callers branch on `null` and redirect / 403 as appropriate. The `allianceId` is included so dashboard queries can scope `ap_map.owner_alliance_id` without an extra DB read.

### mapScopeFilterFor(scope): SQL | undefined
Returns a drizzle `WHERE` clause that restricts `ap_map` rows to those visible to the given `AdminVisibilityScope`. `global` → `undefined` (no extra filter); `corp` → matches `owner_corporation_id`, OR `owner_alliance_id` when the manager's corp has an alliance, OR `owner_character_id IN (members of that corp)` so private maps owned by corp members are scoped in too. Shared by the admin dashboard counts and the admin maps list (`listAdminMaps`).

### characterScopeFilterFor(scope): SQL | undefined
Returns a drizzle `WHERE` clause that restricts `ap_character` rows to a scope. `global` → `undefined`; `corp` → `corporation_id = $corp`.

### requireMapRight(session, mapId, right): Promise<RightGuard>
Tuple-shaped guard for API routes. Returns `{ ok: true, characterId }` or `{ ok: false, status, error }`. Status codes:
- `401` — no session.
- `404` — map missing or no view access (does not leak existence — a 403 here would leak it).
- `403` — view-access OK but missing the right.

### requireMapView(session, mapId): Promise<RightGuard>
View-only variant for read endpoints (e.g. `GET /api/map/[mapId]/wormhole-types`).

### assertMapRight(session, mapId, right): Promise<characterId>
Throws `RightAssertionError` on failure. The Server Action variant of `requireMapRight`.

### viewableMapPredicate(characterId)
Returns a drizzle `where` clause that filters `ap_map` rows to those the actor can view. Returns `undefined` for admins (no filter). Used by `listViewableMaps` to push permission into SQL instead of post-filtering rows in app code.

### RightAssertionError extends Error
Carries `.status` (401/403/404) for the call site to map to an HTTP response.

---

### Depends On
- Session: `next-auth` session type via `@/lib/session`.
- Schema: `ap_character`, `ap_map`, `ap_map_role_access`, `ap_character_role`, `ap_alliance`.
- Types: `MapRight`, `MapType` from `@/types`.

### Invariants
- A `kicked` or `banned` character fails every check, regardless of the rest of their state. (Ban/kick is also gated at login; this is defense-in-depth for any session that was issued before the kick landed.)
- No call here ever rotates an ESI token or hits ESI.
- Every helper is read-only on the DB.

### Runtime note
- **No `import 'server-only'`** in this file. It is imported by `src/lib/realtime/wsServer.ts`, which loads in the custom Node entry (`tsx watch server.ts`) without Next.js's `react-server` resolver condition. Under plain Node, `server-only`'s default export throws on load. Every actual caller is server-side (API routes, Server Actions, the WS upgrade handler); we rely on that rather than the marker package.
