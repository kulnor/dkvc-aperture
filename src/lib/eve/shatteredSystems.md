## shatteredSystems.ts

**Purpose:** Pins the set of shattered wormhole systems by solar-system id, since "shattered" is not derivable from the ingested SDE and is not obvious from a J-sig.
**File:** `src/lib/eve/shatteredSystems.ts`

A shattered system has had its planets/moons destroyed (no anchorable celestials, a permanent system effect, frigate-size limits for the class-13 holes). Sourced from the vendored anoik.is static dataset (`static.json?version=11`, pulled 2026-05-22 — the same snapshot the SDE ingest uses): a system is shattered when anoik gives it a "Planet (Shattered)" celestial (type `30889`). The list is every such system, **excluding** the five Drifter systems (they carry their own identity via `drifterSystems.ts` and are flagged separately on the map). Thera (`31000005`) is included — it is a genuine shattered system. 103 ids total.

---

### isShatteredSystem(systemId: number): boolean
Returns `true` if the solar-system id is a shattered wormhole system (Drifter systems excluded). Used by the map node to render a shattered indicator. Display only — touches no stored data.
