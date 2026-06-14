## resolveAuthz.ts

**Purpose:** Decide a character's cached `ap_character.authz_level` (`member` or `admin`) from explicit hand-assigned grants. Global `admin` is the only authority tier; corp/alliance map authority is the separate `is_director` bit, not encoded here.
**File:** `src/lib/auth/resolveAuthz.ts`

---

### resolveAuthzLevel(characterId: bigint): Promise<AuthzLevel>

Returns `'admin'` iff the character holds an unexpired instance-scoped `ap_access_grant` with `capability='admin'`, else `'member'`. The EVE Director role does **not** raise the level — corp/alliance map-management authority is carried by `ap_character.is_director` and consumed by `canManageMap` / `canCreateMap` in `rights.ts`.

**Parameters:**
- `characterId` — the character whose level to resolve.

**Returns:** `'member' | 'admin'` — written verbatim to `ap_character.authz_level` by `syncCharacterAuthz`.

### Depends On
- Schema: `ap_access_grant` (reads only — `principal_kind='character'`, `scope='instance'`, `capability='admin'`, unexpired).

### Invariants
- Global `admin` is reachable **only** via an explicit `capability='admin'` grant; nothing derives it.
- Expired grants (`expires_at <= now()`) are ignored, so a lapsed temporary super-admin falls back to `member`.
- Instance ownership (`ap_instance_owner`) has no effect on the resolved level (that is a login-gating concern).
