## RoutePlannerModule

**Purpose:** Configurable multi-hop route planner panel (routes-module) — shortest path from a picked character's current system to each saved destination, over K-space stargates + the live wormhole chain (+ optional EVE-Scout), shown as security-coloured breadcrumbs. Replaces the old read-only hub-distance `RouteModule`.
**File:** `src/components/sidebar/RoutePlannerModule.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| mapId | string | yes | Map id for the `route-plan` + `system-search` endpoints. |
| viewerCharacters | { id: number; name: string }[] | yes | The account's active characters for the source picker. |
| mainCharacterId | number \| null | yes | Default source character when located. |
| initialPrefs | RoutePrefs | yes | Server-loaded route settings; seeds local state. |
| initialDestinations | RouteDestinationView[] | yes | Server-loaded saved destinations; seeds local list. |
| connections | MapConnectionEdge[] | yes | The map's live connections; drives recompute when the chain changes. |

### Renders
A `Card` ("Routes") with: a **controls row** of three `Select`s — **From** (source character; online+located only, or a start-system search when none located), **Safety**, and **Min ship** — in a `@container` grid that stacks (1 col) when the card is narrow and spreads to one row (3 cols) at `@md`; an Avoid-reduced / Avoid-critical / Avoid-EOL / EVE-Scout toggle-chip box; and the destination list — each row a name + `Nj` jump count, a remove (✕), and a breadcrumb of per-hop **markers** — **circles** for wormhole (J-space) systems (class `C#` or `J######` name), **squares** for K-space (fill = system security/class colour, border encodes how the hop was entered: gate/origin = grey, wormhole/eve-scout = purple, jumpbridge = cyan). Each marker shows the system's `[tag]` (when set) + name + via label in a hover/focus `Tooltip` (base-ui). An inline "Add destination…" typeahead at the bottom.

### Behaviour & Interactions
- **Source:** `usePresenceForMap()` gives the reactive located-system map; effective source = picked char (if still located) → main (if located) → first located. Re-renders/recomputes when the selected character jumps. With no located character, the user picks a manual start system.
- **Recompute:** debounced (300ms) `POST /api/map/[mapId]/route-plan` whenever the source, prefs, destinations, or a connection signature (`id:scope:mass:eol:jumpMass`) changes; out-of-order responses are dropped via a seq ref; results stored locally.
- **Persistence:** prefs changes optimistically update local state and fire `setRoutePrefsAction` in a transition; destination add/remove optimistically update the local list and call `addRouteDestinationAction` / `removeRouteDestinationAction`.
- `SystemSearchField` (inline) reuses `searchSystemsOnServer` (the map `system-search` endpoint) for both the start-system and add-destination typeaheads. Its result list (`SearchResults`) is **portalled to `document.body`** and pinned under the input via the input's `getBoundingClientRect()` (re-measured on capture-phase scroll + resize) — the enclosing `Card` is `overflow-hidden`, which would otherwise clip an absolutely-positioned dropdown at the card edge.

### Emits / Calls
- `setRoutePrefsAction`, `addRouteDestinationAction`, `removeRouteDestinationAction` (`@/app/(app)/actions/routes`)
- `requestJson('POST', /api/map/<id>/route-plan)` → `RoutePlan[]`
- `usePresenceForMap()` — reactive viewer locations
- `systemClassColor` — chip tint by security band

### Local State
- `prefs: RoutePrefs`, `destinations: RouteDestinationView[]` — seeded from props, mutated optimistically
- `pickedCharId: number | null`, `manualSource: SystemSearchResult | null` — source selection
- `plans: RoutePlan[]`, `computing: boolean` — last compute result
