## WormholeTypeSelect

**Purpose:** Class-filtered wormhole-type dropdown for the signature inspector.
**File:** `src/components/sidebar/WormholeTypeSelect.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| mapId | string | yes | `ap_map.id` for the active map. |
| universeSystemId | number | yes | EVE solar-system id of the host system; filters the catalog by class. |
| value | number \| null | yes | Selected `universe_wormhole.type_id`, or null when unset. |
| onValueChange | (next: number \| null) => void | yes | Fires when the user picks a different option. |
| disabled | boolean | no | Disables the trigger. |
| triggerClassName | string | no | Merged onto the `SelectTrigger` (via `cn`) — used by `SignatureModule` to flatten the pill styling in-table. |

### Renders
A shadcn `Select` populated with WH codes (e.g. "A239", "K162"). Each option uses a flex `justify-between` layout: WH name on the left, destination class on the right, rendered bold and color-coded via `systemClassColor` — the same palette the map uses for system-node statics. The closed trigger mirrors this layout (name left, color-coded class pushed to the right edge) via a `SelectValue` render function given `flex-1` so it stretches the full trigger width. The first item is a sentinel "Select type…" that maps to `null`. The system's statics (`isStatic`) are pinned to the top under a "Statics" label with a pin icon, followed by a divider and the remaining types in alphabetical order. Option rows and the popup are vertically compacted (`py-1` items, `p-0.5` content) to fit the dense Signatures module.

### Behaviour & Interactions
- On mount and whenever `mapId` / `universeSystemId` change, calls `fetchWormholeTypes` (which caches per `(mapId, universeSystemId)`).
- Partitions options into statics-first / others, preserving the server's alphabetical order within each group.
- Disables itself during the initial load.
- Treats the sentinel value `__none__` as null in both directions.

### Depends On
- `Select*` from `@/components/ui/select`
- `fetchWormholeTypes` from `@/lib/map/client`
- `systemClassColor` from `@/components/map/styling` — destination-class color coding
- `WormholeTypeOption` from `@/types`
