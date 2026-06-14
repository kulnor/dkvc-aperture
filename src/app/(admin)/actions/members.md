## members.ts (admin server actions)

**Purpose:** Admin moderation actions on `ap_character` rows — `kick` / `ban` / `activate`, direct `ap_character.status` writes. All gated by `isAdmin` (global operator only); corp Directors carry map authority but cannot moderate.
**File:** `src/app/(admin)/actions/members.ts`

---

### adminKickCharacter(characterId: string, minutes: 5 | 60 | 1440, reason?: string): Promise<ActionResult>
Sets `status='kicked'`, `status_expires_at = now() + minutes`, `status_reason = reason ?? null`, `status_changed_at = now()`. The `character-cleanup` cron (`src/lib/jobs/tasks/characterCleanup.ts`) handles the eventual flip back to `'active'`. Three durations only — 5, 60, 1440 minutes.

### adminBanCharacter(characterId: string, reason: string): Promise<ActionResult>
Sets `status='banned'`, `status_expires_at = null`, `status_reason = reason`, `status_changed_at = now()`. `reason` is required (1-500 chars). Bans never auto-clear — `clearKickExpiries` in the cron filters on `status='kicked'`.

### adminActivateCharacter(characterId: string): Promise<ActionResult>
Clears any moderation state. Sets `status='active'` and NULLs `status_expires_at` / `status_reason`. Works on both kicked and banned rows.

---

### Gating

All three actions require `isAdmin` (global deployment operator). A missing target returns `"Character not found."`. There is no corp-scoped moderation tier any more — the `manager` authz level and the `grantManager` / `revokeManager` toggles were removed in the Stage-4 teardown (migration 0041).

### Audit

Moderation actions write no DB-level audit row (`ap_map_event` is map-scoped, so character-moderation changes are intentionally out of its scope).

### Depends on
- `auth`, `isAdmin` — `@/lib/auth/rights`.
- `apCharacter` — `@/db/schema`.
