## opkeys.ts

**Purpose:** Canonical opKey → swagger `operationId` map the ESI client dispatches against. Data only, no request logic.
**File:** `src/lib/esi/opkeys.ts`

opKey = our short internal operation name (e.g. `getCharacterLocation`). It resolves to a swagger `operationId`, and `src/lib/esi/swagger.json` is authoritative for the resulting HTTP method/path/params.

---

### `OP_KEYS`
`as const satisfies Record<string, OpDef>` — 42 opKeys. Each value is an `OpDef`:
- `operationId: string` — swagger op (verified to exist by `tests/esi/opkeys.test.ts`).
- `auth: 'none' | 'character'` — whether a character ESI token is required.
- `inferred?: true` — pairing not confirmed against an authoritative source.

**Inferred entries** (option-bag args): `setWaypoint` (`post_ui_autopilot_waypoint`), `openWindow` (`post_ui_openwindow_information`), `getRoute` (`get_route_origin_destination`).

**Note:** `getCharacterRoles` and `getCorporationRoles` both map to `get_characters_character_id_roles` (corp roles are a subset of that response) — intentional, not a duplicate bug.

**Authz-related:** `getCharacterTitles` (`get_characters_character_id_titles`) is mirrored into `ap_role(source='corp_title')` by `syncCharacterAuthz`; `getCharacterRoles` drives the Director → `authz_level='manager'` resolution. Both require character auth.

**Killboard:** `getKillmail` (`get_killmails_killmail_id_killmail_hash`, auth none) fetches the full killmail body (victim / ship / time / attacker count) that zKillboard's per-system list endpoint omits. Consumed by `@/lib/map/killboard`.

### `OpDef`
Interface for a single opKey definition (see fields above).

### `OpKey`
`keyof typeof OP_KEYS` — string-literal union of all opKey names. Re-exported from `src/types/index.ts`.
