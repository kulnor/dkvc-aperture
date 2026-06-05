## members.ts (admin server actions)

**Purpose:** Admin actions on `ap_character` rows. Two action groups exposed at `/admin/members`: moderation (`kick` / `ban` / `activate`, direct `ap_character` writes) and the manager toggle (`grantManager` / `revokeManager`, which write `ap_access_grant` + re-resync). All five gated by `isManagerOrAdmin` + `adminVisibilityScope`; the manager toggles additionally require `isAdmin`.
**File:** `src/app/(admin)/actions/members.ts`

---

### adminKickCharacter(characterId: string, minutes: 5 | 60 | 1440, reason?: string): Promise<ActionResult>
Sets `status='kicked'`, `status_expires_at = now() + minutes`, `status_reason = reason ?? null`, `status_changed_at = now()`. The `character-cleanup` cron (`src/lib/jobs/tasks/characterCleanup.ts`) handles the eventual flip back to `'active'`. Three durations only — 5, 60, 1440 minutes.

### adminBanCharacter(characterId: string, reason: string): Promise<ActionResult>
Sets `status='banned'`, `status_expires_at = null`, `status_reason = reason`, `status_changed_at = now()`. `reason` is required (1-500 chars). Bans never auto-clear — `clearKickExpiries` in the cron filters on `status='kicked'`.

### adminActivateCharacter(characterId: string): Promise<ActionResult>
Clears any moderation state. Sets `status='active'` and NULLs `status_expires_at` / `status_reason`. Works on both kicked and banned rows.

### adminGrantManager(characterId: string): Promise<ActionResult>
**Admin only.** Grants corp-scoped `manager` by writing an `ap_access_grant` row (`scope='instance', capability='manage', principal_kind='character'`, `granted_by_character_id` = acting admin) via `addInstanceGrant`, then calls `resyncCachedLevel` (`syncCharacterAuthz`) so the recomputed `authz_level` cache reflects it. Idempotent — re-granting refreshes the existing grant. Refused on an `admin` row (super-admin is governed from `/setup`, not toggled here).

### adminRevokeManager(characterId: string): Promise<ActionResult>
**Admin only.** Deletes the character's `scope='instance', capability='manage'` `ap_access_grant` row, then re-resyncs. The cache may remain `manager` if the character also holds the in-game corp Director role (`resolveAuthzLevel` re-derives it; clear the Director title in EVE to remove). Refused on `admin` rows (governed from `/setup`). When there is no manage grant to drop but the character is a Director-derived `manager`, returns an explanatory error rather than silently no-op'ing.

### resyncCachedLevel(characterId: bigint): Promise<void> *(internal)*
Recomputes and persists `ap_character.authz_level` after a manager grant change by delegating to `syncCharacterAuthz`, so the Director-derived component is re-evaluated alongside the explicit grant. If ESI is unreachable the resync is skipped and the grant reconciles on the next periodic `character-cleanup` pass — the `ap_access_grant` row is already the source of truth.

---

### Gating + scoping

| Action | Required level | Scope |
|---|---|---|
| `adminKickCharacter` | manager | `characterScopeFilterFor(scope)` — manager only sees own corp |
| `adminBanCharacter` | manager | same |
| `adminActivateCharacter` | manager | same |
| `adminGrantManager` | admin | global (scope used only for the existence check) |
| `adminRevokeManager` | admin | global (scope used only for the existence check) |

Out-of-scope targets return `"Character not found."` — same shape as the "row missing" path, so existence isn't leaked to an out-of-corp manager.

### Audit

Moderation actions write no DB-level audit row (`ap_map_event` is map-scoped, so character-moderation changes are intentionally out of its scope). The manager toggle does leave a durable trail: the `ap_access_grant` row records `granted_by_character_id` and `granted_at`.

### Depends on
- `auth`, `isAdmin`, `isManagerOrAdmin`, `adminVisibilityScope`, `characterScopeFilterFor` — `@/lib/auth/rights`.
- `addInstanceGrant` — `@/lib/auth/instanceConfig` (writes the `capability='manage'` grant).
- `syncCharacterAuthz` — `@/lib/auth/syncCharacterAuthz` (recomputes the `authz_level` cache after a grant change).
- `apCharacter`, `apAccessGrant` — `@/db/schema`.
