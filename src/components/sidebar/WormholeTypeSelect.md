## WormholeTypeSelect

**Purpose:** Class-aware wormhole-type dropdown for the signature inspector — short by default, with a "show all" escape hatch.
**File:** `src/components/sidebar/WormholeTypeSelect.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| mapId | string | yes | `ap_map.id` for the active map. |
| universeSystemId | number | yes | EVE solar-system id of the host system; annotates the catalog by class. |
| value | number \| null | yes | Selected `universe_wormhole.type_id`, or null when unset. |
| onValueChange | (next: number \| null) => void | yes | Fires when the user picks a different option. |
| disabled | boolean | no | Disables the trigger. |
| triggerClassName | string | no | Merged onto the `SelectTrigger` (via `cn`) — used by `SignatureModule` to flatten the pill styling in-table. |

### Renders
A `Select` populated with WH codes (e.g. "A239", "K162"). Each option uses a flex `justify-between` layout: WH name on the left, destination class on the right, rendered bold and color-coded via `systemClassColor` — the same palette the map uses for system-node statics. The closed trigger mirrors this layout (name left, color-coded class pushed to the right edge) via a `SelectValue` render function given `flex-1` so it stretches the full trigger width. The first item is a sentinel "Select type…" that maps to `null`.

Options are split into four groups, each keeping the server's alphabetical order:
- **Statics** (`isStatic`) — pinned to the top under a "Statics" label, then a divider.
- **K162** — always rendered immediately after statics (before other class-matched holes) since it is the canonical "inbound" exit hole.
- **Class-matched** (`matchesClass && !isStatic && name !== 'K162'`) — holes that plausibly spawn in this system's class; shown by default.
- **Others** (`!matchesClass`) — the rest of the catalog, hidden behind a `Show all types (+N)` / `Show fewer` toggle button at the foot of the list (a plain `<button>`, not a `SelectItem`, so clicking it expands the group without selecting or dismissing the popup).

Option rows and the popup are vertically compacted (`py-1` items, `p-0.5` content) to fit the dense Signatures module.

### Behaviour & Interactions
- On mount and whenever `mapId` / `universeSystemId` change, calls `fetchWormholeTypes` (which caches per `(mapId, universeSystemId)`) and resets the "show all" toggle to collapsed.
- Partitions options into statics / class-matched / others, preserving the server's alphabetical order within each group.
- `showAll` (local) gates the "others" group; collapsed by default and reset on system change.
- Disables itself during the initial load.
- Treats the sentinel value `__none__` as null in both directions.

### Module-level helpers
- `OptionDivider` — thin `<div>` that renders the horizontal separator between groups; declared at module scope (not inside the component) to satisfy the `react-hooks/static-components` rule.

### Depends On
- `Select*` from `@/components/ui/select`
- `fetchWormholeTypes` from `@/lib/map/client`
- `systemClassColor` from `@/components/map/styling` — destination-class color coding
- `WormholeTypeOption` from `@/types`
