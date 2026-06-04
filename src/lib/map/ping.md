## ping.ts

**Purpose:** Server-side broadcaster for a user-initiated system "ping" — a transient attention pulse fanned to every map viewer, bypassing `ap_map_event`.
**File:** `src/lib/map/ping.ts`

---

### pingSystem({ mapId, mapSystemId }): Promise<{ ok: true } | { ok: false; error: string }>
Resolves `ap_map_system.id` → EVE solar-system id, verifying the row belongs to `mapId` in the same query (so a client can't ping a system off its map). On a hit, fires a direct `pg_notify` on the `map:<id>` channel with `{ task: 'systemNotification', load: { mapId, systemId, kind: 'ping' } }` and returns `{ ok: true }`. Missing row → `{ ok: false, error }` (the route maps this to 404).

This deliberately **does not** write a row or an `ap_map_event` — a ping is a transient signal, not map state. Same direct-`pg_notify` pattern as `characterUpdate` / the zKB `systemNotification` / `connectionMassLog`. The bus discriminates on the top-level `task`; clients pulse the node via `MapUnderglowBridge` (kind `ping` → sky-blue preset).

**Parameters:**
- `mapId` — the target map (`ap_map.id`).
- `mapSystemId` — the pinged node (`ap_map_system.id`).

**Returns:** `{ ok: true }` on broadcast, `{ ok: false, error }` when the system isn't on the map.

### Depends On
- `drizzle-orm`, `@/db/client` (`db`), `@/db/schema` (`apMapSystem`), `aperture.config` (channel prefix).
