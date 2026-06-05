## location.ts

**Purpose:** Zod decoder for the ESI character-location response.
**File:** `src/lib/esi/decoders/location.ts`

---

### `locationSchema`
Decodes `getCharacterLocation` → `get_characters_character_id_location`: the pilot's current `solar_system_id` (guaranteed), plus optional `station_id` / `structure_id` (present only when docked, mutually exclusive in practice).

### `EsiLocation`
`z.infer<typeof locationSchema>`.
