## PilotRosterButton

**Purpose:** Map-toolbar button that opens the online-pilot roster in a non-blocking popover.
**File:** `src/components/map/PilotRosterButton.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| viewData | MapViewData | yes | The canvas's live map data; used to build the `systemId → node` tag map. |

### Renders
A ghost `Button` (`Users` icon, `Pilots (n)` with the live online count) that toggles a `Popover` containing `<PilotRoster>`.

### Behaviour & Interactions
- Reads the roster from `usePresenceForMap()` (context) — **must render inside `MapPresenceProvider`**. The count and table track realtime `characterUpdate` movement while mounted.
- The popover is **non-modal** and **sticky**: pressing the button toggles it open/closed, but outside clicks do **not** dismiss it (the `outside-press` `onOpenChange` reason is cancelled) so it stays open while working the map underneath. Escape still closes it. Tracks `open` as controlled state (needed to gate the viewer poll).
- Builds the `systemId → MapSystemNode` map from `viewData.systems` (memoised) and passes it to `PilotRoster` for the tag badge.
- **Viewer poll:** while the popover is open, polls `GET /api/map/[id]/viewers` (immediately, then every `VIEWERS_POLL_MS` = 15s) for the set of character ids whose account has the map open in a live socket (account-level coverage), and passes it to `PilotRoster` as `viewerIds` to drive the "online but map not open" icon. Polling stops when the popover closes; failures leave the previous flags in place.

### Depends On
- `@/components/ui/popover`, `@/components/ui/button`
- `usePresenceForMap` from `@/components/map/MapPresenceContext`
- `PilotRoster` from `@/components/map/PilotRoster`
- `GET /api/map/[mapId]/viewers` (viewer roster)
- Types `MapViewData`, `MapSystemNode` from `@/types`
