## PilotRoster

**Purpose:** Presentational table of online tracked pilots — pilot / location (class-coloured class label + system + map tag) / ship.
**File:** `src/components/map/PilotRoster.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| presence | readonly MapPresenceEntry[] | yes | The online + located pilot roster (from `usePresenceForMap()`). |
| systemNameById | Map<number, MapSystemNode> | yes | EVE solar-system id → placed map node, for resolving the map-specific tag badge. |

### Renders
A scrollable 3-column table (Pilot / Location / Ship); an empty state when no tracked pilots are online. Location shows a class-coloured class label, the system name (falls back to the raw id when not on the map), and the placed node's tag badge when present. Ship shows the custom hull name with the type appended when it differs.

### Behaviour & Interactions
- Stateless: re-renders only when `presence`/`systemNameById` change. Name/class/security ride the presence entry (server-resolved); only the tag is looked up against the placed nodes.

### Depends On
- `ScrollTable`/`Th`/`Td`/`EmptyRow` from `@/components/dialogs/infoTable`
- `systemClassColor` from `@/components/map/styling`
- Types `MapPresenceEntry`, `MapSystemNode` from `@/types`
