## map.ts (server actions)

**Purpose:** Low-frequency, user-initiated map mutations (create / soft-delete / settings) as Next.js Server Actions. Each validates input, lands one `ap_map_event` via `commitMapEvent`, and `revalidatePath('/maps')`.
**File:** `src/app/(app)/actions/map.ts`

---

### createMapAction(input: CreateMapInput): Promise<ActionResult<MapEventPayload>>
Validates `{ name, scope, type, icon? }` (Zod). Pre-allocates the `ap_map.id` from its sequence (needed as both the event `map_id` FK and the payload `id` before the row exists — mirrors the `eventId` pre-allocation in `commitMapEvent`), inserts the map, and emits `map.create`. New map id is in `data.id`. Revalidates `/maps` on success.

### deleteMapAction(mapId: string): Promise<ActionResult<MapEventPayload>>
Two-phase soft-delete: sets `deleted_at = now()` (cron purges later — never a hard delete here) on the matching non-deleted map. Throws (→ `{ ok: false }`) if the map is missing or already deleted. Emits `map.delete` → `{ id, deletedAt }`. Revalidates `/maps`.

### updateMapSettingsAction(input: UpdateMapSettingsInput): Promise<ActionResult<MapEventPayload>>
Validates `{ mapId, name?, icon?, deleteExpiredConnections?, deleteEolConnections?, trackAbyssalJumps?, logActivity?, tagScheme?, homeMapSystemId?, exemptHomeStaticFromTag? }`. Base fields gate on `map_update`. When `tagScheme`/`homeMapSystemId`/`exemptHomeStaticFromTag` are present they additionally require `isMapOwnerOrAdmin` (owner/admin only, tighter than the corp-grantable `map_update`); a non-null `homeMapSystemId` is validated to be a visible system on the map. Tagging fields persist but are **not** echoed in the `map.update` payload (config propagates on next load). Updates only the keys present (presence via `in`, so `false` is honored). Emits `map.update` → `{ id, ...changed }`. After a tagging-touching save it runs `applyHomeStaticExemption` (reconciles the ABC home-static exemption as separate `system.update` events; no-op for non-ABC maps). Revalidates `/maps`.

---

### type CreateMapInput / UpdateMapSettingsInput
Zod input shapes for the create / settings actions.

### Depends On
- `requireSession` (`@/lib/session`) — auth gate + audit `characterId`.
- `commitMapEvent` (`@/lib/map/mutations/core`) — the single commit primitive.
- `apMap` (Drizzle schema); `mapScope` / `mapType` enums for validation.
- `mapEventPayloadSchema` variants `map.create` / `map.delete` / `map.update`.
