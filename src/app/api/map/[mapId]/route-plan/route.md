## route-plan/route.ts

**Purpose:** routes-module compute endpoint — shortest paths from a source system to saved destinations over the stargate graph + live wormhole chain (+ optional EVE-Scout).
**File:** `src/app/api/map/[mapId]/route-plan/route.ts`

---

### POST /api/map/[mapId]/route-plan
View-guarded (`requireMapView`). Body (Zod `bodySchema`): `{ sourceSystemId: number; destinationSystemIds: number[] (≤50); prefs: RoutePrefs }` — prefs validated by the shared `routePrefsSchema`. Delegates to `planRoutes` (`src/lib/map/routePlanner.ts`) and returns `{ ok: true, data: RoutePlan[] }`, one plan per destination in input order. Invalid JSON/body → 400; missing/non-viewable map → 404 via the guard.

**Read-only:** no DB writes, no `ap_map_event`. A JSON API route (not a Server Action) because it's a high-frequency recompute returning data; prefs ride in the body so the panel can preview unsaved setting tweaks. The heavy gate graph is cached in-process by `getGateGraph`.
