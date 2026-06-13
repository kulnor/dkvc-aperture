## opkeys.ts

**Purpose:** Canonical opKey → OpenAPI `operationId` map the ESI client dispatches against. Data only, no request logic.
**File:** `src/lib/esi/opkeys.ts`

opKey = our short internal operation name (e.g. `getCharacterLocation`). It resolves to an OpenAPI `operationId` (e.g. `GetCharactersCharacterIdLocation`), and `src/lib/esi/openapi.json` is authoritative for the resulting HTTP method/path/params.

---

### `OP_KEYS`
`as const satisfies Record<string, OpDef>` — 43 opKeys. Each value is an `OpDef`:
- `operationId: string` — OpenAPI op (verified to exist by `tests/esi/opkeys.test.ts`).
- `auth: 'none' | 'character'` — whether a character ESI token is required.
- `inferred?: true` — pairing not confirmed against an authoritative source.

**Inferred entries** (option-bag args): `setWaypoint` (`PostUiAutopilotWaypoint`), `openWindow` (`PostUiOpenwindowInformation`), `getRoute` (`PostRoute`).

**Note:** `getCharacterRoles` and `getCorporationRoles` both map to `GetCharactersCharacterIdRoles` (corp roles are a subset of that response) — intentional, not a duplicate bug.

**Authz-related:** `getCharacterTitles` (`GetCharactersCharacterIdTitles`) is mirrored into `ap_role(source='corp_title')` by `syncCharacterAuthz`; `getCharacterRoles` drives the Director → `authz_level='manager'` resolution. Both require character auth.

**Killboard:** `getKillmail` (`GetKillmailsKillmailIdKillmailHash`, auth none) fetches the full killmail body (victim / ship / time / attacker count) that zKillboard's per-system list endpoint omits. Consumed by `@/lib/map/killboard`.

**Cron-driven intel feeds:** `getSovereigntyMap` (`GetSovereigntySystems`), `getFactionWarSystems` (`GetFwSystems`), and `getIncursions` (`GetIncursions`) (all auth none) back the read-side intel module via the `sov-fw-refresh` and `incursion-refresh` jobs.

### `OpDef`
Interface for a single opKey definition (see fields above).

### `OpKey`
`keyof typeof OP_KEYS` — string-literal union of all opKey names. Re-exported from `src/types/index.ts`.
