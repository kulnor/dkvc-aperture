## affiliation.ts

**Purpose:** Zod decoder for ESI's bulk `POST /characters/affiliation/` response — the ~1h-cached corp/alliance source that replaces the ~24h-cached public character profile for keeping `ap_character` affiliation fresh.
**File:** `src/lib/esi/decoders/affiliation.ts`

---

### characterAffiliationEntrySchema
One row of the affiliation response: `{ character_id, corporation_id, alliance_id?, faction_id? }`. `corporation_id` is always present; `alliance_id` / `faction_id` are optional (absent when the character has none). `.loose()` for forward-compat.

### characterAffiliationSchema
`z.array(characterAffiliationEntrySchema)` — the full response shape passed as `schema` to `esiCall('getCharacterAffiliation', …)`.

**Exports:** `characterAffiliationEntrySchema`, `characterAffiliationSchema`, and types `EsiCharacterAffiliationEntry`, `EsiCharacterAffiliation`. Re-exported from `src/lib/esi/decoders/index.ts`.
