## wormholeTypes.ts

**Purpose:** Wormhole-catalog lookups — class-filtered WH-type suggestion and connection "mark as static" matching.
**File:** `src/lib/map/wormholeTypes.ts`

> **Class join key:** `universe_system.security` (the `C1`–`C6` / `HS` / `LS` / `NS` labels), **not** `universe_system.security_class`. The catalog's `source_class`/`target_class` use the same labels as `universe_system.security`, and the seeded catalog + the read-path tests use exactly those. `security_class` is the unrelated SDE ore-spawn field and would never match the catalog — `security` is correct.

---

### jumpMassBand(kg: number | null): WhJumpMass | null
Buckets a wormhole's `wormholeMaxJumpMass` (kg) into the `s`/`m`/`l`/`xl` connection size bands. Thresholds: `≤5M → s`, `≤100M → m`, `<1B → l`, `≥1B → xl` (chosen to sit in the gaps between EVE's discrete jump-mass values — 5M / 62M / 300M·375M / 1B+). `null` in → `null` out. Used by both `wormholeTypesForSystem` (to tag each option) and the signature module's auto-set of a linked connection's size.

---

### wormholeTypesForSystem(systemId: number): Promise<WormholeTypeOption[]>
Returns the wormhole types that can appear in `systemId`, for the WH-type dropdown. Reads the system's `security` class label, then selects every `universe_wormhole` row where `source_class IS NULL` (appears anywhere — covers the universal `K162`) or `source_class = <class>`, ordered by code. Unknown `systemId` → `[]`. A system with a null `security` returns only the null-source (universal) rows.

Each row is left-joined to its `wormholeMaxJumpMass` dogma value (resolved by name from `universe_dogma_attribute`, read through `universe_type_attribute_effective`) and tagged with the `jumpMassBand` result. If the attribute name can't be resolved, every `jumpMassClass` is `null` (no join performed).

Each row is also tagged `isStatic: true` when its `type_id` is one of the system's `universe_system_static` rows, so the dropdown can pin the system's statics to the top.

**Returns:** `WormholeTypeOption[]` — `{ typeId, name, sourceClass, targetClass, jumpMassClass, isStatic }`.

---

### staticMatchForConnection(args): Promise<StaticMatch[]>
"Mark as static": resolves the target system's `security` class, then matches it against the source system's statics — each `universe_system_static` row joined to `universe_wormhole.target_class`. Returns every static whose destination class equals the target system's class (a system may hold several). Empty when nothing matches or the target class is unknown.

**Parameters:**
- `args.sourceSystemId` — system the connection leaves from (whose statics are checked).
- `args.targetSystemId` — system the connection leads into.

**Returns:** `StaticMatch[]` — `{ typeId, name, targetClass }`.

---

### type WormholeTypeOption / StaticMatch
Result shapes for the two lookups. Re-exported from `src/types/index.ts`.

### Depends On
- `universeSystem`, `universeSystemStatic`, `universeWormhole` (Drizzle schema). The static→catalog join mirrors `loadMap.ts` `loadStatics`.
