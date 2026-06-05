## ping/route.ts

**Purpose:** API route that broadcasts a transient "ping" pulse on a system to everyone viewing the map.
**File:** `src/app/api/map/[mapId]/ping/route.ts`

---

### `POST /api/map/[mapId]/ping`
Fans a transient `systemNotification` (kind `ping`) to map viewers via `pingSystem` (`src/lib/map/ping.ts`). **Not a mutation** — writes no row and emits no `ap_map_event`. Returns `{ ok }`; the underglow arrives over realtime.

**Body:** `{ mapSystemId }` (`ap_map_system.id`, numeric string). Resolved to its EVE solar-system id and verified on the map server-side; a 404 means it isn't on the map.

**Access:** `map_view` — any viewer may ping (no persistent state; part of live fleet coordination).
