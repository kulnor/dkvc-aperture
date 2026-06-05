## page.tsx (map view)

**Purpose:** Read-only map view route (`/map/<id>`) — server-loads a map and renders it on the xyflow canvas with route, intel, and kill-stats sidebars.
**File:** `src/app/(app)/map/[[...slug]]/page.tsx`

### Renders
`<MapCanvas>` directly (the map name and meta are rendered inside the canvas toolbar row). Empty-state `Card` (with a back-to-maps link) when no map id is in the slug or the map is missing/deleted.

### Behaviour & Interactions
- Optional catch-all slug; the first segment is the map id (numeric → bigint, else empty state).
- `loadMapForView(mapId, viewerCharacterId)` returns null for missing / soft-deleted / non-viewable maps → "Map not found" (does not leak existence).
- Precomputes 24h stats (`statsForSystems`), read-side intel (`intelForSystems`), manual structure intel (`structuresForSystems`), the map's editable settings (`loadMapSettings`, for the settings dialog), the viewer's connection-travel-animation toggle (`getConnectionTravelAnimation`), the viewer's resolved signature-indicator prefs (`getSignatureIndicatorPrefs` — threshold + toggles for the stale/unscanned node indicators), `isMapOwnerOrAdmin` (gates the Map Settings "Tagging" tab), the account roster (`getAccountCharacters`), the account's route-planner config (`loadRouteConfig` — settings + saved destinations, routes-module), and the main character id (`getMainCharacterId`) for all visible systems in parallel and passes them to the client canvas. Initial pilot-presence (`MapViewData.presence`) ships with the map payload from `loadMapForView`.
- `viewerCharacterIds` / `viewerCharacters` are derived from the account roster (active characters): the ids drive the CTRL+V fast-paste location check, and `{ id, name }` feeds the route planner's source-character picker. The hub-distance route module was replaced by `RoutePlannerModule`, so this page no longer computes `routesForSystems`.
- Session gating is handled by the `(app)` layout. No edit affordances.

### Depends On
- `@/lib/map/loadMap`, `@/lib/map/routeConfig`, `@/lib/map/stats`, `@/lib/map/intel`, `@/lib/structures/read`, `@/lib/session` (`getAccountCharacters`, `getConnectionTravelAnimation`, `getMainCharacterId`, `getMapLayout`, `getSignatureIndicatorPrefs`, `requireSession`), `@/components/map/MapCanvas`, `@/components/ui/card`.
