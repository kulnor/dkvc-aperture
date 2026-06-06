## SignatureModule

**Purpose:** Standalone full-width signatures panel rendered below the map. Renders a filterable, sortable nine-column table (Sig / Group / Type / Description / Leads to / TTL / Created / Updated / delete) for the selected system; placeholder when nothing is selected.
**File:** `src/components/sidebar/SignatureModule.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| mapId | string | yes | `ap_map.id` (for the WH-types endpoint and paste dialog). |
| system | MapSystemNode \| null | yes | The selected system; when `null` the panel renders a "select a system" placeholder. |
| signatures | MapSignature[] | yes | All signatures on the map; the module filters by `mapSystemId === system.id`. |
| connections | MapConnectionEdge[] | yes | All connections on the map (forwarded to `ConnectionSelect`). |
| systems | MapSystemNode[] | yes | All systems on the map (forwarded to `ConnectionSelect`). |
| onCreate | (body: CreateSignatureBody) => void | yes | Called when the user submits the add form. The parent issues the POST. |
| onPatch | (signatureId: string, patch: UpdateSignatureBody) => void | yes | Called for inline edits (group/type/description/connection). |
| onDelete | (signatureId: string) => void | yes | Called from the row trash button. |
| onBulkPaste | (payloads: MapEventPayload[]) => void | yes | Forwarded to `SignaturePasteDialog`; caller registers each `eventId` in its dedupe set and applies each payload locally. |
| onConnectionPatch | (connectionId: string, patch: UpdateConnectionBody) => void | yes | Used to auto-set a linked connection's jump-mass size from the WH type (see below). Wired to `MapCanvas`'s `onConnectionPatch` (optimistic). |
| lazyDelete | boolean | yes | Whether the one-shot CTRL+V "Lazy delete" arm is active (state owned by `MapCanvas`, shared with `SignaturePasteHotkey`). |
| onLazyDeleteChange | (next: boolean) => void | yes | Toggles the lazy-delete arm from the header button. |

### Renders
A `Card` with:
- Header row (only when a system is selected): the selected system's alias/name as muted subtext on the left, and a **Lazy delete** toggle (`LazyDeleteToggle`) plus a **Paste from scanner** button grouped on the right. The panel name ("Signatures") comes from the surrounding `MapPanel` chrome — no in-card title.
- Body: when no system is selected, a placeholder message. When a system is selected: a **filter bar** (`SignatureFilterBar`) above the table, the nine-column TanStack Table, and a draft-input row below. TTL is a forward countdown (`formatRelativeFromMs`); Created and Updated are backward "time ago" strings (`formatAgoFromMs`).
- The **Sig**, **Group**, **Created**, and **Updated** column headers are sortable (click to sort ascending, click again to reverse, arrow indicator shows active sort). Default sort is Sig ascending. Other columns (Type, Description, Leads to, TTL, delete) are non-interactive headers.
- The filter bar has group toggle chips (Combat / Relic / Data / Gas / Wormhole / Ore / Ghost / Unknown) and a scan-state button cycling **All → Scanned only → Unscanned only**. Both filters compose; `assignedConnectionIds` is derived from the unfiltered row list so hidden sigs still hold their connection bindings.
- **Row density:** the table is tuned for high data density. The `<table>` carries `[&_[data-slot=input]]:h-6 [&_[data-slot=select-trigger]]:h-6` so in-row selects and inputs shrink from the default `h-8` to `h-6`; the body cell wrappers use `py-px` (1px, down from `py-0.5`); the header padding in `colHeaderClass` is `py-0.5` (down from `py-1`); and the row delete button is `size="icon-xs"` (`size-6`, was `size="icon"` / `size-8`) with a `size-3.5` glyph so it no longer gates row height. All scoped to the table, so the draft "Add" row below (outside the `<table>`) keeps standard `h-8` controls for comfortable data entry.

### Behaviour & Interactions
- The body re-mounts on system change (`key={system.id}`) so draft state for the add form resets cleanly when the selection changes.
- **Group cascade:** Changing a row's Group to a *different* value nulls `typeId` and `name`; when the new group is no longer `wormhole` (or wasn't but now is), `mapConnectionId` is also nulled. Re-selecting the same group is a no-op — no PATCH is issued and no fields are cleared. The cascade is sent as one PATCH containing the combined keys (see `buildGroupChangePatch`).
- **Type cell** cascades on Group:
  - `wormhole` → `WormholeTypeSelect`. Picks a `universe_wormhole` row; writes `typeId`.
  - cosmic groups → `SiteTypeCombobox` bound to `sig.name`: class+group-filtered site-name suggestions (from `signatureSites.ts`, keyed off `system.security`) with a free-text fallback; patches on blur.
  - `null` (unknown) → italic placeholder text.
- **Leads-to cell** is `ConnectionSelect`, enabled only for `groupKey === 'wormhole'`. Its options are filtered to the selected WH type's destination class via the `targetClass` prop: `useWormholeTypeMeta(mapId, system.systemId)` builds a `typeId → { targetClass, jumpMassClass }` map (reusing the cached `fetchWormholeTypes` data), and the row/draft pass the entry for `sig.typeId` / `draftTypeId`. A type with no/unknown target (e.g. K162) passes `null` → unfiltered. Options are also filtered by `excludeIds={assignedConnectionIds}` (the connection ids already bound to a sig in this system) so a connection already claimed by another sig isn't suggested — the binding is 1:1. `assignedConnectionIds` is `rows.map(s => s.mapConnectionId)` (non-null); each `ConnectionSelect` exempts its own `value`, so a row keeps showing its own binding.
- **Auto-set connection size:** once a WH sig has both a type and a linked connection, `syncConnectionSize(typeId, connectionId)` pushes the type's inferred `jumpMassClass` (from the same `useWormholeTypeMeta` map, server-derived from `wormholeMaxJumpMass`, e.g. O477 → `L`) onto that connection via `onConnectionPatch`. Fired whichever side is set last: from the Type cell's change (with the row's existing `mapConnectionId`), the Leads-to cell's change (with the row's `typeId`), and on draft submit (with the draft's type + connection). A type whose band can't be inferred (K162) leaves the connection size untouched.
- **Description cell** uses `EditableTextCell` to patch `sig.description` on blur.
- **`EditableTextCell`** is a small internal helper: a controlled `Input` with a local draft, committed on blur. It re-syncs from `value` only when the input isn't focused, so optimistic-apply and realtime updates don't clobber mid-edit typing. Controlled-mode also avoids Base UI's "uncontrolled `FieldControl` default value changed after init" warning that fires when the parent re-renders with a new `defaultValue` after a blur-triggered patch.
- **Missing-cell highlight:** a sig is "fully scanned" when its Sig, Group, and Type are filled in — plus "Leads to" for wormholes. Each still-empty *required* cell recolors its control's border to `destructive` (via the `MISSING_CELL` descendant-variant class on the `<td>`, targeting `data-slot=select-trigger` / `data-slot=input`), so unresolved cells read red at a glance. Per-cell rules: Group highlights when `groupKey === null`; Type highlights when a group is set but the value is empty (`typeId` for wormholes, `name` for cosmic groups — note this *does* count a missing cosmic site name, unlike the map-node `isUnscanned` rollup); "Leads to" highlights only for wormholes with no `mapConnectionId`. The Sig cell is never highlighted (always present), and Type isn't flagged while the Group is still empty (fix the group first).
- Filters incoming `signatures` to the current system by `mapSystemId`.
- **Filter bar** (`SignatureFilterBar`): group chips are multi-select toggles (empty = show all groups); the scan-state button cycles All / Scanned only / Unscanned only. "Fully scanned" = group set AND type set (for wormholes `typeId`, for cosmic `name`) AND for wormholes `mapConnectionId` set. Filter state lives in `SignaturePanelBody` and resets on system change (via `key={system.id}` remount).
- **Active-state styling:** group chips render via the local `FilterToggle` helper — active = soft violet tint (`border-violet-400/50 bg-violet-400/15 text-violet-300`), inactive = muted `outline` — so enabled filters stand out without the harshness of a solid fill. Violet is used rather than `primary` because the theme's `primary` is near-neutral and reads as gray at low opacity. The scan button tints the same way when active: emerald for "Scanned only", sky for "Unscanned only" (sky echoes the map's unscanned `Signal` pill on `SystemNode`); "All" is a plain outline. All active tints carry `dark:`-prefixed copies so they override the `outline` variant's `dark:bg-input/30`.
- The add form's `sigId` is auto-uppercased; required (Add disabled while empty). Group dropdown is required to enable the Type cell.
- `expiresAt` for new sigs defaults to `now + apertureConfig.SIGNATURE_DEFAULT_TTL_MS`.
- **Paste from scanner** opens `SignaturePasteDialog` with the active system pre-bound.
- **Lazy delete** (`LazyDeleteToggle`): a one-shot arm button. Click to arm (renders `destructive` variant, label "Lazy delete armed"); while armed, the next direct CTRL+V scanner paste also removes sigs absent from the paste. The arm state lives in `MapCanvas` and is consumed (disarmed) by `SignaturePasteHotkey` once that paste commits — a deliberate arm-then-paste gesture so an accidental Ctrl+V can't wipe sigs. Only affects the direct-paste hotkey, not the paste dialog (which carries its own remove options).

### Depends On
- `WormholeTypeSelect`, `SignatureGroupSelect`, `ConnectionSelect`, `SiteTypeCombobox`
- `SignaturePasteDialog` (`@/components/dialogs/SignaturePasteDialog`)
- `Card`, `Button`, `Input` from `@/components/ui/*`
- `labelForSignatureGroupKey` from `@/lib/map/signatureGroups`
- `formatRelativeFromMs`, `formatAgoFromMs` from `@/lib/map/relativeTime`
- `fetchWormholeTypes` from `@/lib/map/client` (target-class + jump-mass-band map for the Leads-to filter and connection-size auto-set)
- `apertureConfig` (`SIGNATURE_DEFAULT_TTL_MS`) from `aperture.config`
- `@tanstack/react-table` — `useReactTable`, `createColumnHelper`, `getSortedRowModel`, `flexRender` for the sortable table
- `SIGNATURE_GROUP_CATALOG` from `@/lib/map/signatureGroups` (group chip iteration)
- Types: `MapConnectionEdge`, `MapEventPayload`, `MapSignature`, `MapSystemNode`, `SignatureGroupKey` from `@/types`; body types from `@/lib/map/client`
