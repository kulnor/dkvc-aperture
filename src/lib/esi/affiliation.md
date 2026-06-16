## affiliation.ts

**Purpose:** Bulk character → corporation/alliance resolver over ESI's `getCharacterAffiliation` endpoint (~1h cache), the source Aperture uses to keep `ap_character` affiliation fresh for access decisions.
**File:** `src/lib/esi/affiliation.ts`

> No `import 'server-only'` — reachable from the `character-cleanup` job task (bare `tsx`) and the Auth.js `signIn` callback.

---

### fetchAffiliations(characterIds: bigint[]): Promise<Map<bigint, CharacterAffiliation>>
Resolves the given character ids to `{ corporationId, allianceId }` via ESI's bulk affiliation POST, chunked to ESI's 1000-id limit (one `esiCall` per chunk). Token-less.

**Parameters:**
- `characterIds` — character ids to resolve. Empty input short-circuits with no ESI call.

**Returns:** A `Map` keyed by character id. Ids ESI omits from the response are absent from the map. `allianceId` is `null` when the character is in no alliance.

**Errors:** ESI failures (`EsiBreakerOpenError`, `EsiDowntimeError`, `EsiHttpError`, `EsiDecodeError`) propagate — the caller decides whether to skip/degrade.

### interface CharacterAffiliation
`{ corporationId: bigint; allianceId: bigint | null }`.
