## subchain.ts

**Purpose:** Delete-subchain orchestrator — tears down a head system and its orphaned branch (connections + systems) atomically in one transaction, returning the N committed event payloads.
**File:** `src/lib/map/mutations/subchain.ts`

---

### deleteSubchain(input: DeleteSubchainInput): Promise<ActionResult<SubchainDeleteResult>>
Resolves the head's subchain via `computeSubchain` (`@/lib/map/subchainGraph`) — the head plus everything orphaned from the keep-side anchor by removing it — then, under one outer `db.transaction`: hard-deletes every connection whose source or target is in the set (the collapsed head↔anchor hole + any loop-back edges), then soft-deletes every system in the set. Each delete is routed through `deleteConnection` / `removeSystem` with the shared `tx`, so any failure rolls the whole batch back. Connections are torn down before systems so `connection.delete` events precede `system.removed`.

**Anchor resolution:** the map's `home_map_system_id` when set; otherwise `input.anchorMapSystemId` (which, in the no-Home path, must be a direct neighbour of the head). Home always wins, so a misuse can never delete known space. Guards: map exists, anchor present, anchor ≠ head, head + anchor are both visible, resolved set non-empty.

**Parameters:**
- `input.mapId` — `ap_map.id`.
- `input.headMapSystemId` — `ap_map_system.id` of the system to delete with its branch.
- `input.anchorMapSystemId` — keep-side neighbour `ap_map_system.id`; used only when the map has no Home (ignored otherwise). May be null.
- `input.characterId` — audit FK; null when the actor was erased.

**Returns:** `ActionResult<SubchainDeleteResult>` — `{ summary: { systemsRemoved, connectionsRemoved }, payloads: MapEventPayload[] }`. The wrapper `eventId` is always `0` (an N-event path); consumers read `data.payloads[].eventId`.

### type DeleteSubchainInput / SubchainDeleteSummary / SubchainDeleteResult
Input + result bags. `SubchainDeleteResult` is re-exported from `src/types/index.ts`.

### Depends On
- `computeSubchain`, `neighborsOf` (`@/lib/map/subchainGraph`) — pure traversal + neighbour resolution.
- `deleteConnection` (`./connections`), `removeSystem` (`./systems`) — per-row helpers, both joined via the shared `tx`.
- `apMap`, `apMapSystem`, `apMapConnection` (Drizzle schema) for the in-transaction reads.
