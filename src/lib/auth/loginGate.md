## loginGate.ts

**Purpose:** The login gate — decides, before any session/JWT is issued, whether a character may sign in under the instance's `access_mode`, with an allowlist, owner-membership, and bootstrap path.
**File:** `src/lib/auth/loginGate.ts`

---

### getAccessMode(): Promise<'open' | 'restricted'>
Reads the `ap_instance` singleton (`id=1`) and returns its `access_mode`. Defaults to `'restricted'` when the row is absent — a fresh, unconfigured deployment is locked down, not open.

**Returns:** `'open'` (any EVE account may log in) or `'restricted'` (allowlist-gated).

---

### isLoginAllowed(p: LoginPrincipals): Promise<boolean>
The gate the Auth.js `signIn` callback consults. DB-only — the caller resolves corp/alliance via a public ESI lookup and passes them in.

**Parameters (`LoginPrincipals`):**
- `characterId` — the authenticating character (always known).
- `corporationId` — EVE corp id, or `null` when the ESI affiliation lookup failed.
- `allianceId` — EVE alliance id, or `null` when unaffiliated / lookup failed.

**Logic:**
1. `access_mode='open'` ⇒ `true` (no gate).
2. **Owner membership** — `true` if `corporationId`/`allianceId` (non-null) match an `ap_instance_owner` row.
3. **Instance grant** — `true` if an unexpired `ap_access_grant` (`scope='instance'`, `capability IN ('login','admin','manage')`) exists for the character, its corp, or its alliance. (`admin`/`manage` imply login.) Expiry filter: `expires_at IS NULL OR expires_at > now()`.
4. **Bootstrap** — see `tryBootstrap`; admits the first caller on a completely unconfigured instance.
5. Otherwise `false`.

**Side effect:** the bootstrap branch inserts an `admin` grant (see below).

**ESI-degrade behaviour:** when `corporationId`/`allianceId` are `null` (caller's ESI fetch failed), the owner and corp/alliance-grant checks naturally no-op, so only character-level grants + bootstrap can admit. Fail-closed for the unverifiable parts; never fail-open.

---

### Bootstrap (internal `tryBootstrap`)
On a *completely* unconfigured instance — zero `ap_instance_owner` rows **and** zero instance-scoped `ap_access_grant` rows **and** no `ap_character` with `authz_level='admin'` — the first caller is admitted and recorded as a permanent `('character', characterId, scope='instance', capability='admin', note='bootstrap')` grant (via `onConflictDoNothing`). The `jwt` → `syncCharacterAuthz` → `resolveAuthzLevel` chain then caches their `authz_level='admin'`. Prevents permanent lockout before `/setup` is used. A concurrent first-login race is bounded by the grant's unique constraint and is acceptable (no locking).

### Depends On
- Schema: `ap_instance` (access mode), `ap_instance_owner` (owner corps/alliances), `ap_access_grant` (allowlist + bootstrap write), `ap_character` (admin-existence check for bootstrap).

### Invariants
- Restricted-by-default: absent `ap_instance` row ⇒ `'restricted'`.
- Never fails open: an ESI affiliation lookup failure can only *narrow* who is admitted.
- The bootstrap grant is `capability='admin'` (not `login`) so the first operator can immediately administer.
