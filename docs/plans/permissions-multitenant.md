# Multi-Tenant, EVE-Derived Map Permissions

**Goal:** Make map-management authority a pure function of EVE state + ownership so corps and alliances self-manage their maps with zero operator setup. Members manage their own private maps (webhooks and all); corp Directors manage their corp maps; the alliance executor-corp's Directors manage alliance maps. Drop the `manager` authz tier and the `ap_corporation_right` matrix from the baseline; moderation becomes global-admin-only. Fold map settings / webhooks / audit-log onto the map itself, gated by the derived authority. Leave clean seams for the future title-delegation (R4) and sharing (R5) features.

**References:**
- CLAUDE.md §"Auth & ESI", §"Mutation pathways", §"Lifecycle patterns", §"Planning Mode".
- `src/lib/auth/rights.md` / `rights.ts` — the gate being rewritten.
- `src/lib/auth/resolveAuthz.md`, `syncCharacterAuthz.md`, `loginGate.md`.
- `src/db/schema/ap/{character,enums,corporation_right,role,access_grant,instance}.md`.
- `src/app/(app)/actions/map.md`, `src/app/api/map/README.md`, `src/app/(admin)/actions/{maps,members,webhooks,settings}.md`.
- Memory: migrations hand-written since 0011 (`.sql` + `.rollback.sql` + journal, apply before tests); DB integration tests hit the live dev DB (snapshot/restore real rows); `rights.ts` must not import `server-only`.

---

## Decisions locked (from design discussion)

1. **Authority derives from EVE Director role + ownership.** The `ap_corporation_right` matrix leaves the baseline entirely.
2. **Two layers.** *Baseline* (this plan) = binary "can I manage this map?" from EVE+ownership. *Delegation overlay* (R4, future) = a Director grants corp titles a granular subset of rights, managed per-map in the map settings panel. The `MapRight` enum survives as the delegation vocabulary.
3. **Moderation (kick/ban/activate) is global-admin-only.** Eliminates the current privilege-inversion bug.
4. **`manager` authz level is dropped.** `authz_level` becomes `member | admin`. Corp authority is expressed through the derived Director bit, not a cached tier.
5. **Alliance maps:** only the alliance **executor corp's** Directors may create or manage them. Ordinary alliance members cannot mint alliance maps.
6. **Management surfaces fold onto the map** (settings, webhooks, audit log), gated by `canManageMap`. `/admin` reduces to operator-only (instance settings, moderation, cross-tenant oversight, purge).
7. **Audit log:** Directors/owner only by default; delegating view to specific titles or all members is R4.
8. No backwards-compat for the dropped matrix / `manager` data (CLAUDE.md): migrations may drop them outright. Pre-launch, no production data to preserve.

---

## Target authority model

```
canManageMap(actor, map):
  actor must be status='active'
  admin (authz_level='admin')                         → true   # deployment operator
  map.type='private'   → map.owner_character_id == actor.id
  map.type='corp'      → actor.is_director && actor.corporation_id == map.owner_corporation_id
  map.type='alliance'  → actor.is_director
                         && actor.alliance_id == map.owner_alliance_id
                         && actor.corporation_id == executorCorpOf(map.owner_alliance_id)
  all-NULL owner       → admin only (unchanged defensive default)

canCreateMap(actor, type):
  private   → any active character
  corp      → actor.is_director (owns to actor.corporation_id)
  alliance  → actor.is_director && actor.corporation_id == executorCorpOf(actor.alliance_id)

requireMapRight(actor, map, right):           # baseline; right ignored at baseline
  canManageMap(actor, map)  ||  hasDelegatedRight(actor, map, right)   # 2nd clause = R4 stub (false for now)
```

**View** is unchanged: all corp members view corp maps; all alliance members view alliance maps. Only create/manage tightens. `canViewMap` / `viewableMapPredicate` keep their owner-match + (future) role overlay.

---

## Stage 1 — Derived-authority data + `canManageMap` (additive)
**Mode:** Plan mode
**Goal:** Land the data and the new authority functions without removing or rewiring anything. Build stays green; old gates still in force.
**Touches:**
- `src/db/migrations/00XX_derived_authority.sql` (+ `.rollback.sql` + journal): add `ap_character.is_director boolean not null default false`; create `ap_alliance` cache table (`id bigint PK`, `name text`, `executor_corporation_id bigint`, `last_synced_at timestamptz`).
- `src/db/schema/ap/character.ts`, new `src/db/schema/ap/alliance.ts`, `src/db/schema/index.ts`, `src/types/index.ts` (+ companions).
- `src/lib/esi/decoders/alliance.ts` (new Zod decoder for `getAlliance`) if absent; `src/lib/auth/syncCharacterAuthz.ts` — persist `is_director`; upsert `ap_alliance` executor when the character has an alliance.
- `src/lib/auth/rights.ts` — add `canManageMap(characterId, mapId)`, `executorCorpOf` helper, and a typed `canCreateMap(characterId, type)`; **do not** delete old functions yet.
**Decisions to make here:** `ap_alliance` table vs caching a derived `is_exec_corp_director` boolean on `ap_character` (lean: table — executor changes then reflect for everyone on next alliance refresh, read via one join). Whether to refresh `ap_alliance` only on sign-in/sync or add a small cron.
**Done when:** migration applies on the dev DB; a sign-in writes `is_director` + the character's `ap_alliance` row; new functions have unit/integration coverage (snapshot/restore real rows); `pnpm lint && pnpm typecheck && pnpm build` green.

## Stage 2 — Rewire baseline create/mutate to derived authority
**Mode:** Accept edits
**Goal:** Make the new authority the actual gate. Matrix no longer consulted for create/mutate.
**Touches:**
- `src/app/(app)/actions/map.ts` — `createMapAction` uses `canCreateMap(actor, type)`; private→any active, corp→director (owns to corp), alliance→exec-director (owns to alliance). Reject non-exec alliance creation.
- `src/lib/auth/rights.ts` — `canMutateMap`/`requireMapRight`/`assertMapRight` baseline = `canManageMap` (right ignored at baseline, param retained for R4). Remove the `ap_corporation_right` consult. Collapse `isMapOwnerOrAdmin` (auto-tagging tier) into `canManageMap` — with the matrix gone there is no looser `map_update` to guard against.
- `src/app/api/map/utils.ts` (`requireMapMutate`) — follows the new `requireMapRight`.
- `tests/integration/permissions.test.ts`, `permissions-scope.test.ts`, `tests/unit/route-rights-coverage.test.ts` — rewrite expectations.
**Done when:** a plain member creates + fully manages a private map; a Director creates + manages a corp map; an executor-corp Director manages an alliance map; a non-executor alliance corp's Director is denied; admin overrides everywhere. All permissions tests green; lint/typecheck/build green.

## Stage 3 — Fold management surfaces onto the map
**Mode:** Plan mode
**Goal:** Move settings / webhooks / audit-log out of `/admin/*` to in-place map UI gated by `canManageMap`, so owners and Directors manage in the same place.
**Touches:**
- `src/app/api/map/[mapId]/audit/route.ts` — gate on `canManageMap` (Director/owner) instead of `requireMapView + isManagerOrAdmin`.
- `src/app/(admin)/actions/webhooks.ts` → relocate to a map-scoped action gated by `canManageMap` (drop `isManagerOrAdmin + mapScopeFilterFor`). Surface a webhooks editor in the map UI.
- Audit console + map settings: expose in-place (e.g. from `MapSettingsDialog` / a map management drawer) for `canManageMap` holders; remove the `(admin)/admin/maps/[mapId]/{settings,webhooks,audit}` routes.
- `src/components/dialogs/MapSettingsDialog.tsx` and related map chrome (+ companions).
**Decisions to make here:** exact UI home for each surface; whether corp Directors still want a "all my corp's maps" list (a lightweight in-app view, not `/admin`).
**Done when:** a private-map owner edits settings, webhooks, and reads the audit log in-place; a corp Director does the same on corp maps; none of these require `/admin`; lint/typecheck/build green.

## Stage 4 — Reduce `/admin` to operator-only; drop `manager` + the matrix
**Mode:** Plan mode
**Goal:** Finish the teardown. `/admin` is the deployment operator's console only; `authz_level` is `member | admin`.
**Touches:**
- Moderation: `src/app/(admin)/actions/members.ts` gate on `isAdmin` (drop `isManagerOrAdmin`, drop the `adminGrantManager`/`adminRevokeManager` actions and `manage` grant path). `src/app/(admin)/admin/members/page.tsx`, `src/components/admin/MemberActionsMenu.tsx`.
- `src/app/(admin)/admin/layout.tsx` gate on `isAdmin`.
- Remove the corp-rights matrix: `src/lib/admin/corpRights.ts`, `src/components/admin/CorpRightsMatrix.tsx`, `src/components/admin/CorpPicker.tsx`, the corp-right actions in `src/app/(admin)/actions/settings.ts`, `src/app/(admin)/admin/settings/page.tsx`, `src/db/schema/ap/corporation_right.ts`, and drop the `ap_corporation_right` table (migration).
- Simplify scope helpers in `rights.ts`: `adminVisibilityScope` → `global | null`; remove `mapScopeFilterFor`/`characterScopeFilterFor` corp branches; simplify `listAdminMaps` / `listAdminMembers` to global. Update `src/lib/map/loadMap.ts`.
- Drop `manager` from `authz_level`: migration recreating the enum as `('member','admin')` (Postgres can't drop an enum value in place — create new type, `ALTER COLUMN ... USING`, drop old; map any existing `manager` rows to `member`). `src/db/schema/ap/enums.ts`. Simplify `src/lib/auth/resolveAuthz.ts` (admin only via explicit `capability='admin'`; Director no longer derives a tier — `is_director` carries corp authority). Audit every `'manager'` reference from the Stage-0 grep list and remove.
- `src/app/(admin)/actions/members.md` and all touched companions.
**Done when:** no `manager` references remain; the enum migration applies (and rolls back); `/admin` is admin-only and contains only operator surfaces; moderation is admin-only; corp-right matrix is gone; lint/typecheck/build + full test suite green.

## Stage 5 — Title-delegation overlay (R4) — *future, design-only here*
**Mode:** Plan mode
**Goal:** Let a Director grant corp titles (or all members) a granular subset of rights on a specific map, from the map settings panel — including audit-log view.
**Sketch:** wire `hasDelegatedRight(actor, map, right)` as the 2nd clause of `requireMapRight`. Substrate decision: extend `ap_access_grant` (`scope='map'`, `principal_kind='role'`, finer `capability` values) vs. add a right column to `ap_map_role_access`. Corp titles already sync into `ap_role` / `ap_character_role`. Surface the delegation editor in the map settings panel.
**Done when:** (deferred) a title holder can be granted, e.g., audit-log view or export on a single map without becoming a Director.

## Stage 6 — Sharing (R5) — *future, design-only here*
**Mode:** Plan mode
**Goal:** Members share their private maps; Directors share corp / alliance(exec) maps to named entities with optional expiry.
**Sketch:** `ap_access_grant scope='map'` (`view`/`edit`), `who-can-share = canManageMap`. Re-introduce `map_share` as a delegatable right and unhide it in the UI (until then it stays hidden — it currently renders in the matrix and does nothing).
**Done when:** (deferred).

---

## Cross-cutting conventions & risks

- **Migrations are hand-written** (memory): each stage's schema change ships `.sql` + `.rollback.sql` + a journal entry, applied to the dev DB **before** running tests. Do not run `db:generate`.
- **No back-compat shims** (CLAUDE.md): dropping `ap_corporation_right` and the `manager` enum value is a clean break.
- **Enum value removal** is the trickiest migration (Stage 4) — Postgres requires the create-new-type / swap / drop dance, and any in-flight `manager` rows must be remapped to `member` first.
- **DB tests hit the live dev DB** (memory): global-state tests snapshot and restore real rows.
- **`rights.ts` / `resolveAuthz.ts` must not import `server-only`** (memory) — they load in the bare-Node WS entry.
- **Companion `.md` updates are part of every source edit** (CLAUDE.md standing instruction).
- **Stage independence:** Stages 1–2 are additive-then-swap (build green throughout); Stage 3 is UI relocation; Stage 4 is the teardown that finally removes the old vocabulary. Run each in a fresh session.
