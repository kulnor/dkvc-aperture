## route.ts — GET /api/map/[mapId]/wormhole-types

**Purpose:** Returns wormhole type options filtered to a solar system's class — fed by the WH-type dropdown in the signature inspector.
**File:** `src/app/api/map/[mapId]/wormhole-types/route.ts`

### GET
**Query params:** `systemId` — the EVE solar-system id (`universe_system.id`) to filter by.

**Response:** `{ ok: true, data: WormholeTypeOption[] }` — each option carries `{ typeId, name, sourceClass, targetClass, jumpMassClass }`. `jumpMassClass` is the `s`/`m`/`l`/`xl` band inferred from the type's `wormholeMaxJumpMass` dogma value (null when unknown, e.g. K162); the signature module uses it to auto-set a linked connection's size. Returns the universal `K162` (null source class) plus every type whose `source_class` matches the system's security label. An unrecognised `systemId` returns an empty array.

**Responses:** 200 ok, 400 missing/invalid systemId, 401 unauthenticated, 404 map not found.
