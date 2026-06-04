## MapContextMenu

**Purpose:** Cursor-anchored right-click context menu for the map canvas, exposing every no-text-input system / connection / pane action without opening the inspector.
**File:** `src/components/map/MapContextMenu.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| target | MapContextMenuTarget \| null | yes | The right-clicked target (kind + id + cursor x/y). `null` ⇒ menu closed. |
| onClose | () => void | yes | Called when the menu requests to close (outside click, Escape, item select). |
| systems | MapSystemNode[] | yes | Live system rows; the `system` target is resolved by `id` from here. |
| connections | MapConnectionEdge[] | yes | Live connection rows; the `connection` target is resolved by `id` from here (also used to list a head's neighbours for the no-Home subchain submenu). |
| homeMapSystemId | string \| null | yes | The map's designated Home. Drives the subchain entry: single-click when set, keep-side submenu when null; the Home node itself shows no subchain item. |
| onSystemPatch | (id: string, patch: UpdateSystemBody) => void | yes | Commits a system field change (optimistic in `MapCanvas`). |
| onSystemRemove | (id: string) => void | yes | Removes the system from the map. |
| onConnectionPatch | (id: string, patch: UpdateConnectionBody) => void | yes | Commits a connection field change. |
| onConnectionDelete | (id: string) => void | yes | Deletes the connection. |
| onAddSystemAt | (clientX: number, clientY: number) => void | yes | Opens the add-system dialog targeting the clicked client point. |
| onDeleteSubchain | (headId: string) => void | yes | Home-anchored delete-subchain: delete this head + its branch (Home is the keep-side). |
| onDeleteSubchainPick | (headId: string, anchorId: string) => void | yes | No-Home fallback: delete this head, keeping the chosen neighbour's side. |
| onDeleteDisconnected | () => void | yes | Pane action: delete every system disconnected from the Home. |

### Renders
A Base UI menu popup anchored to the cursor point, with per-kind items:

- **system** — `Status ▸` radio submenu (`SYSTEM_STATUSES`); `Set rally` / `Clear rally` toggle; `Locked` checkbox; separator; destructive `Remove from map`; then the delete-subchain entry (hidden when the target is the Home node): with a Home set, a single destructive `Delete subchain`; without a Home, a `Delete subchain ▸` submenu listing the head's neighbours as `Keep <label>` (disabled when the head has no connections).
- **connection** — `Mass ▸` (`WH_MASSES`), `Jump mass ▸` (`unknown` + `WH_JUMP_MASSES`), `Type ▸` (`CONNECTION_SCOPES`), `EOL ▸` (`EOL_STAGES` via `EOL_STAGE_LABELS`) radio submenus; `Preserve mass` / `Rolling` / `Static` checkboxes (`Static` designates the link as the source system's static — drives the ABC home-static exemption); separator; destructive `Delete connection`.
- **pane** — `Add system`; plus a destructive `Delete disconnected` (Unlink icon) shown only when a Home is set **and** `computeDisconnected` finds ≥1 system cut off from it (otherwise the action is a no-op, so it's hidden).

If the target id no longer resolves (realtime removed it), a single disabled "… not found" item is shown.

### Behaviour & Interactions
- Built on **`ContextMenu.Root`** (Base UI), not raw `Menu.Root`. This puts the menu in context-menu mode (`parent.type === 'context-menu'`), which gates the open/dismiss lifecycle — outside-press grace period and the `allowMouseEnter` flag that submenu hover-open depends on. A raw `Menu.Root` stays in dropdown mode and collapses the moment submenu hover machinery engages, so the submenu-bearing system/connection menus would vanish on pointer move (the submenu-free pane menu survived either way). Open + positioning are still driven by us.
- Controlled via `open={target !== null}`; `onOpenChange(false)` → `onClose`. No manual document listeners.
- Positioned with a **virtual anchor** (`getBoundingClientRect` returning a zero-size rect at `target.x`/`target.y`), opening `side="right"` / `align="start"` from the cursor like a native menu.
- Right-click does **not** change map selection — the menu carries `target.id` directly.
- Every leaf action invokes its callback **and** `onClose()`, so the menu closes after each pick (radio/checkbox close via the patch callback calling `onClose`).
- Jump-mass uses the `__none__` sentinel (rendered "unknown") to mean `jumpMassClass: null`, mirroring `InspectorModule.tsx`.
- Row text is column-aligned: submenu triggers and plain items pass `inset`, and destructive/add items pass their leading icon via the `icon` prop, so they share the same left gutter as the `Locked` / `Preserve mass` / `Rolling` checkbox items.

### Depends On
- `@/components/ui/menu` — `MenuItem`, `MenuSubmenu`, `MenuSubmenuTrigger`, `MenuSubmenuContent`, `MenuRadioGroup`, `MenuRadioItem`, `MenuCheckboxItem`, `MenuSeparator`.
- `@base-ui/react/context-menu` — `ContextMenu.Root` for the context-menu-mode root (controlled `open` + virtual anchor).
- `@base-ui/react/menu` — `Portal` / `Positioner` / `Popup` for the cursor-anchored popup (styling mirrors `MenuContent`).
- `@/lib/map/enumLabels` — enum value lists + EOL labels and their types.
- `@/lib/map/subchainGraph` — `neighborsOf` for the no-Home keep-side submenu; `computeDisconnected` to decide whether the pane `Delete disconnected` item shows.
- `MapContextMenuTarget`, `MapSystemNode`, `MapConnectionEdge` (`@/types`); `UpdateSystemBody`, `UpdateConnectionBody` (`@/lib/map/client`).
