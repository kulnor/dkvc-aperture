## resolveAuthz.ts

**Purpose:** Decide a character's cached `ap_character.authz_level` from the Director-derived level combined with explicit hand-assigned grants.
**File:** `src/lib/auth/resolveAuthz.ts`

---

### resolveAuthzLevel(input: ResolveAuthzInput): Promise<AuthzLevel>

Returns the `max` (`member < manager < admin`) of:
- **derived** — `isDirector ? 'manager' : 'member'`. Any in-game corp Director resolves to corp-scoped `manager`, **regardless of instance ownership** (`ap_instance_owner` is NOT consulted — that is a login-gating concern).
- **explicit** — the highest unexpired instance-scoped `ap_access_grant` for this character: `capability='admin' ⇒ admin`, `capability='manage' ⇒ manager`.

Global `admin` is therefore reachable **only** via an explicit `capability='admin'` grant; nothing derives it.

**Parameters:**
- `characterId` — the character whose level to resolve.
- `isDirector` — whether ESI reports the corp Director role (`syncCharacterAuthz` computes this from `getCharacterRoles`).

**Returns:** `'member' | 'manager' | 'admin'` — written verbatim to `ap_character.authz_level` by `syncCharacterAuthz`.

### Depends On
- Schema: `ap_access_grant` (instance-scoped character grants; reads only — `principal_kind='character'`, `scope='instance'`, `capability IN ('admin','manage')`, unexpired).

### Invariants
- `manager` is scoped to the actor's own corp downstream by `adminVisibilityScope` / `mapScopeFilterFor` in `rights.ts` — this resolver does not encode the scoping, only the level.
- Expired grants (`expires_at <= now()`) are ignored, so a lapsed temporary super-admin falls back to the Director-derived level.
- Ownership of the instance has no effect on the resolved level (deliberate — reverses the original overhaul-plan draft).
