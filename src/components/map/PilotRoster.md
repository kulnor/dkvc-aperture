## PilotRoster

**Purpose:** Presentational table of online tracked pilots — pilot / location (class-coloured class label + map tag + system) / ship type / custom ship name.
**File:** `src/components/map/PilotRoster.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| presence | readonly MapPresenceEntry[] | yes | The online + located pilot roster (from `usePresenceForMap()`). |
| systemNameById | Map<number, MapSystemNode> | yes | EVE solar-system id → placed map node, for resolving the map-specific tag. |
| viewerIds | ReadonlySet<number> | yes | Character ids whose account currently has this map open in a live socket (from `GET /api/map/[id]/viewers`, polled by `PilotRosterButton`; account-level coverage, so an account's alts all count as "viewing" when it has the map open). |

### Renders
A scrollable 4-column table (Pilot / Location / Type / Ship); an empty state when no tracked pilots are online. Pilot shows the character name plus an amber `Unplug` icon (with a `title`) when the pilot is online in-game but **not** in `viewerIds` — i.e. online but doesn't have the map open in Aperture. Location shows a class-coloured class label, the placed node's tag (same class-coloured `font-mono font-bold` styling as the class label, when present), then the system name (falls back to the raw id when not on the map). Type is the resolved ship hull type. Ship is the pilot's custom hull name, shown only when it differs from the type (ESI defaults `ship_name` to the type name); otherwise `—`.

### Behaviour & Interactions
- Stateless: re-renders only when `presence`/`systemNameById`/`viewerIds` change. Name/class/security ride the presence entry (server-resolved); only the tag is looked up against the placed nodes, and the map-open flag against `viewerIds`.

### Depends On
- `ScrollTable`/`Th`/`Td`/`EmptyRow` from `@/components/dialogs/infoTable`
- `systemClassColor` from `@/components/map/styling`
- `Unplug` from `lucide-react`
- Types `MapPresenceEntry`, `MapSystemNode` from `@/types`
