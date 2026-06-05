## routePrefs.ts

**Purpose:** Shared `RoutePrefs` Zod validator (routes-module), at the system boundary for both the persist Server Action and the compute API route.
**File:** `src/lib/map/routePrefs.ts`

---

### routePrefsSchema: z.ZodType<RoutePrefs>
Validates `{ safety, minShipClass (nullable), avoidReduced, avoidCritical, avoidEol, includeEveScout }` against the `route_safety` / `wh_jump_mass` enum values. Lives outside the `'use server'` action file (which may only export async functions); imported by `actions/routes.ts` (`setRoutePrefsAction`) and `api/map/[mapId]/route-plan/route.ts`.
