## characterLogout.ts

**Purpose:** Broadcast a `characterLogout` envelope on a map channel so live viewers drop pilots from the presence roster immediately (used when access is revoked after a corp/alliance departure).
**File:** `src/lib/realtime/characterLogout.ts`

> No `import 'server-only'` — reachable from the `character-cleanup` job task (bare `tsx`).

---

### broadcastCharacterLogout(mapId: bigint, characterIds: bigint[]): Promise<void>
Publishes `{ task: 'characterLogout', load: { characterIds } }` via a direct `pg_notify('map:'||mapId, …)` (bypasses `ap_map_event`, mirroring the location-poll's `characterUpdate` pattern). No-op when `characterIds` is empty.

**Parameters:**
- `mapId` — the map channel to broadcast on.
- `characterIds` — EVE character ids to drop from that map's roster.

### Consumed by
- `src/lib/realtime/bus.ts` — routes the `characterLogout` task to the WS fan-out.
- `src/components/map/MapPresenceContext.tsx` — `PresenceStore.remove` drops the pilots from the client store.
