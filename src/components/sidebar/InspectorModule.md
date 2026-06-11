## InspectorModule

**Purpose:** Selection-driven sidebar panel that hosts all editable fields for the currently selected system or connection.
**File:** `src/components/sidebar/InspectorModule.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| selected | SelectionRef \| null | yes | `{ kind: 'system' \| 'connection', id }` or `null`. |
| viewData | MapViewData | yes | Source of the system / connection being edited. |
| onSystemPatch | (mapSystemId, patch: UpdateSystemBody) => void | yes | Issue a PATCH on the system. |
| onSystemRemove | (mapSystemId) => void | yes | DELETE the system (visible=false). |
| onConnectionPatch | (connectionId, patch: UpdateConnectionBody) => void | yes | PATCH the connection. |
| onConnectionDelete | (connectionId) => void | yes | DELETE the connection (hard). |

### Renders
One of three sub-views:
- **`SystemInspector`** — status select, alias / tag inputs (per-keystroke commit), intel notes textarea (committed on blur), locked checkbox, rally toggle button (label reads "Set rally" / "Clear rally" depending on current state), "Remove from map" button. Signatures are now a separate full-width panel below the map (see `SignatureModule`). The card title and the alias-input placeholder use `systemDisplayName(system.systemId, system.name)`, which shows the short community name for the five Drifter systems (e.g. "Barbican"); display only, the stored name is unchanged.
- **`ConnectionInspector`** — scope / mass / jump-mass / EOL-stage selects (EOL stage is `None` / `EOL (~4h)` / `Critical (~1h)`), Preserve / Rolling checkboxes, a live "Expires in X" / "EOL expires in X" hint (`ConnectionExpiryHint`, derived from `connectionTimeLeftMs` + `formatRelativeFromMs`, hidden for non-wormhole scopes), the read-only per-jump `ConnectionMassLog` (server-derived cumulative mass), then the "Delete connection" button. Receives `mapId` (from `viewData.map.id`) to feed the mass-log fetch; remounted via `key={connection.id}`.
- **`EmptyInspector`** — placeholder card prompting the user to select something.

### Behaviour & Interactions
- All edits go through the supplied callbacks; the inspector itself holds no view state beyond the intel-notes draft and the rally toggle UI.
- `intelNotes` is read-write: the textarea seeds a local draft from `system.intelNotes` and commits on blur (only when the draft differs from the stored value) to avoid a PATCH per keystroke. Emptying the field commits `null`.
- Selecting a different system re-seeds the intel draft (the sub-view is keyed by `system.id`).
- A jump-mass value of `__none__` maps to `null` on the wire.

### Depends On
- `Select*`, `Card*`, `Button`, `Input` shadcn primitives
- `connectionTimeLeftMs` (`@/lib/map/connectionState`) + `formatRelativeFromMs` (`@/lib/map/relativeTime`) for the expiry hint
- `ConnectionMassLog` (`@/components/sidebar/ConnectionMassLog`) for the per-jump mass-log block
- Enum value lists from `@/lib/map/enumLabels`
- `systemDisplayName` (`@/lib/eve/drifterSystems`) for the Drifter short-name title/placeholder
- `MapViewData`, `MapSystemNode`, `MapConnectionEdge` from `@/types`
- Body types from `@/lib/map/client`
