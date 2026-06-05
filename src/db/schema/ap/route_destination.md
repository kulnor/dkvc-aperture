## route_destination.ts

**Purpose:** A saved route-planner destination owned by an account (routes-module).
**File:** `src/db/schema/ap/route_destination.ts`

---

### apRouteDestination
`pgTable('ap_route_destination', …)` (migration `0036`):
- `id` — `bigserial`, PK.
- `user_id` (`userId`) — `integer NOT NULL`, FK → `ap_user.id` `ON DELETE cascade`. The owning account.
- `system_id` (`systemId`) — `integer NOT NULL`, FK → `universe_system.id` `ON DELETE restrict`. The destination solar system. A real cross-`ap_`/`universe_` boundary FK per the DB rules; RESTRICT so a universe rebuild can't silently drop a saved destination.
- `label` (`label`) — nullable `text`. Optional pilot alias ("Home", "Staging"); the UI falls back to the system name when null.
- `created_at` — `timestamptz NOT NULL DEFAULT now()`.
- **Unique** `(user_id, system_id)` (`ap_route_destination_user_id_system_id_key`) — one row per account per destination system.

Personal config, not map data — these rows never produce an `ap_map_event`. Written by `addRouteDestinationAction` / `removeRouteDestinationAction` (`src/app/(app)/actions/routes.ts`); loaded for the planner panel by `loadRouteConfig`.
