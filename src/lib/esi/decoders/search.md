## search.ts

**Purpose:** Zod decoder for the ESI character-search response.
**File:** `src/lib/esi/decoders/search.ts`

---

### `searchResultSchema`
Decodes `search` → `get_characters_character_id_search`: one id array per requested category (`corporation`, `alliance`, …), each capped at 500 by ESI. Every field is optional since only requested categories are returned; the structure dialog requests `corporation` only. Requires the `esi-search.search_structures.v1` scope, which gates all categories.

### `EsiSearchResult`
`z.infer<typeof searchResultSchema>`.
