## audit/page.tsx

**Purpose:** Manager audit console for a single map — server page that gates access, scopes the map, loads the actor list, and renders the interactive `MapAuditBrowser`.
**File:** `src/app/(admin)/admin/maps/[mapId]/audit/page.tsx`

### Renders
A header (`Audit — <map name>` + map id, with a "Back to maps" link) above `<MapAuditBrowser mapId actors />`.

### Behaviour & Interactions
- Parses `mapId`; invalid → `notFound()`.
- Gates on `isManagerOrAdmin(session)` then `adminVisibilityScope(session)` (both redirect to `/maps` on failure) — managers/admins only, on top of the `(admin)` layout's own gate.
- `loadAuditMap(mapId, scope)` confirms the map is in the manager's scope (and **allows soft-deleted maps**); `null` → `notFound()`.
- `listAuditActors(mapId)` supplies the actor filter dropdown options.
- The feed itself is fetched client-side by `MapAuditBrowser` from `/api/map/[mapId]/audit`.

### Depends On
- `loadAuditMap` / `listAuditActors` (`src/lib/map/audit.ts`)
- `isManagerOrAdmin` / `adminVisibilityScope` (`src/lib/auth/rights.ts`)
- `MapAuditBrowser` (`src/components/admin/MapAuditBrowser.tsx`)
