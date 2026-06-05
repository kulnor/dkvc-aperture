## ship.ts

**Purpose:** Zod decoder for `getCharacterShip`. The location-poll persists `ship_type_id` to `ap_character.last_ship_type_id` for the head breadcrumb; `ship_name` feeds the presence hover panel.
**File:** `src/lib/esi/decoders/ship.ts`

---

### normalizeShipName(raw: string): string
Undoes a long-standing ESI bug: `get_characters_character_id_ship` returns `ship_name` as a Python `repr()` string (`u'๓...'`) when the name contains non-ASCII characters, but as a plain string otherwise. Detects the `u'…'` / `u"…"` wrapper and decodes the inner Python string escapes (`\uXXXX`, `\U00XXXXXX`, `\xXX`, and the simple `\n \t \\ \' …` set). Any value not matching the wrapper is returned verbatim, so well-formed names are untouched.

**Returns:** The real Unicode ship name.

---

### characterShipSchema → EsiCharacterShip
`getCharacterShip` (`get_characters_character_id_ship`): `{ ship_type_id, ship_item_id, ship_name }` — all required per swagger. `ship_name` is run through `normalizeShipName` via a Zod `.transform`, so consumers always receive a real string.

`ship_item_id` is per-ship-instance (persists until repackaged); the poll captures it in the decoded shape but doesn't store it today. Useful for a future "did the pilot swap ships?" signal.
