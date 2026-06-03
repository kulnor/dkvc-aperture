## subchain/route.ts

**Purpose:** Delete-subchain endpoint — removes a head system and its orphaned branch (touched connections + systems) atomically. Wraps `deleteSubchain` from `mutations/subchain.ts`.
**File:** `src/app/api/map/[mapId]/subchain/route.ts`

---

### POST /api/map/[mapId]/subchain
**Body:**
```ts
{
  headMapSystemId: string,            // ap_map_system.id of the system to delete + its branch
  anchorMapSystemId?: string | null,  // keep-side neighbour; required only when the map has no Home
}
```

**Auth & guards:** `requireMapMutate(rawMapId, session, 'map_update')` (Stage 15) — 401 / 403 / 404.

**Behaviour:** Resolves the subchain server-side (`computeSubchain` over the live map graph: head + everything orphaned from the keep-side anchor by removing it). The anchor is the map's `home_map_system_id` when set, otherwise the supplied `anchorMapSystemId` (which must be a direct neighbour of the head). Hard-deletes every connection touching the set, then soft-deletes the systems, all under one transaction. After a successful delete it reconciles the ABC home-static exemption (`applyHomeStaticExemption`, best-effort — failures are logged, not fatal; no-op on non-ABC maps).

**Returns:** `ActionResult<SubchainDeleteResult>`. On success: `{ ok: true, data: { summary: { systemsRemoved, connectionsRemoved }, payloads }, eventId: 0 }` — consumers iterate `payloads` for per-event `eventId`s (the wrapper's `eventId` is `0` because this is an N-event path). On failure: `{ ok: false, error }` with HTTP 400.
