## sovereignty.ts

**Purpose:** Zod decoders for sovereignty and faction-warfare ESI responses.
**File:** `src/lib/esi/decoders/sovereignty.ts`

---

### sovereigntyMapSchema
Validates the `getSovereigntyMap` (`GetSovereigntySystems`, `/sovereignty/systems`) response — an object with a `solar_systems` array, each entry carrying a `claim` (`oneOf` `faction` / `alliance` / `unclaimed`) — and **transforms** it into the legacy flat array of `{ system_id, faction_id?, alliance_id?, corporation_id? }`. Unclaimed systems flatten to an all-null-owner row, matching the previous flat endpoint. The consumer is unchanged.

**Returns:** `EsiSovereigntyMap` (the flattened array).

---

### factionWarSystemsSchema
Validates `getFactionWarSystems` arrays with system id, owner/occupier factions, contested text, and victory-point progress.

**Returns:** `EsiFactionWarSystems`.
