## drifterSystems.ts

**Purpose:** Pins the five Drifter ("Uni") wormhole systems to their real classes (C14–C18) and short display names, which can no longer be derived from SDE static data.
**File:** `src/lib/eve/drifterSystems.ts`

CCP's 2025 conquest event renamed the five Drifter systems and consolidated them into a single constellation (K-C00334, region K-R00033). Because they now share one constellation, the SDE `wormholeClassID` reports class 1 for all of them, so `deriveSecurityLabel` alone floors them to `C1`. This module restores the per-system class and supplies the community short name (the stored `universe_system.name` keeps CCP's canonical lore name).

System id → class → short name: `31000001` Sentinel (C14), `31000002` Barbican (C15), `31000003` Vidette (C16), `31000004` Conflux (C17), `31000006` Redoubt (C18).

---

### DRIFTER_SYSTEMS: Record<number, DrifterSystem>
Map of solar-system id → `{ classId, shortName }` for the five Drifter systems.

---

### drifterClassLabel(systemId: number): string | null
Returns the `C14`–`C18` security label for a Drifter system id, or `null` if the id is not a Drifter system. Used at SDE ingest to override the constellation-derived label.

---

### isDrifterSystem(systemId: number): boolean
Returns `true` if the solar-system id is one of the five Drifter wormhole systems. Used by the map node to render a Drifter indicator (and to exclude Drifter systems from the shattered indicator — see `shatteredSystems.ts`).

---

### systemDisplayName(systemId: number, name: string): string
Returns the Drifter short name (e.g. `Barbican`) for a Drifter system id, else the passed-in `name` unchanged. Used by the map node and the inspector for display only — it does not change stored data.
