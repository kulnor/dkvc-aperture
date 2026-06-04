## disconnected/route.ts

**Purpose:** Delete-disconnected endpoint — removes every visible system with no path back to the map's Home (touched connections + systems) atomically. Wraps `deleteDisconnected` from `mutations/subchain.ts`.
**File:** `src/app/api/map/[mapId]/disconnected/route.ts`

---

### POST /api/map/[mapId]/disconnected
**Body:** none. The server derives the doomed set from the map's Home + live graph.

**Auth & guards:** `requireMapMutate(rawMapId, session, 'map_update')` — 401 / 403 / 404.

**Behaviour:** Resolves the disconnected set server-side (`computeDisconnected` over the live map graph: every visible system unreachable from the Home). Requires a Home to be set (400 otherwise). Hard-deletes every connection touching the set, then soft-deletes the systems, all under one transaction. After a successful delete it reconciles the ABC home-static exemption (`applyHomeStaticExemption`, best-effort — failures logged, not fatal; no-op on non-ABC maps).

**Returns:** `ActionResult<SubchainDeleteResult>`. On success: `{ ok: true, data: { summary: { systemsRemoved, connectionsRemoved }, payloads }, eventId: 0 }` — consumers iterate `payloads` for per-event `eventId`s. On failure: `{ ok: false, error }` with HTTP 400.
