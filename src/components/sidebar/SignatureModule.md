## SignatureModule

**Purpose:** Standalone full-width signatures panel rendered below the map. Renders an eight-column table (Sig / Group / Type / Description / Leads to / TTL / Created / Updated) for the selected system; placeholder when nothing is selected.
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

### Renders
A `Card` with:
- Header row: the title (`Signatures — <system alias or name>`) and, when a system is selected, a **Paste from scanner** button.
- Body: when no system is selected, a placeholder message. When a system is selected, an eight-column table and a draft-input row below it. TTL is a forward countdown (`formatRelativeFromMs`); Created and Updated are backward "time ago" strings (`formatAgoFromMs`).

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
- **Missing-cell highlight:** a sig is "fully scanned" when its Sig, Group, and Type are filled in — plus "Leads to" for wormholes. Each still-empty *required* cell recolors its control's border to `destructive` (via the `MISSING_CELL` descendant-variant class on the `<td>`, targeting `data-slot=select-trigger` / `data-slot=input`), so unresolved cells read red at a glance (Pathfinder's cue). Per-cell rules: Group highlights when `groupKey === null`; Type highlights when a group is set but the value is empty (`typeId` for wormholes, `name` for cosmic groups — note this *does* count a missing cosmic site name, unlike the map-node `isUnscanned` rollup); "Leads to" highlights only for wormholes with no `mapConnectionId`. The Sig cell is never highlighted (always present), and Type isn't flagged while the Group is still empty (fix the group first).
- Filters incoming `signatures` to the current system by `mapSystemId`.
- The add form's `sigId` is auto-uppercased; required (Add disabled while empty). Group dropdown is required to enable the Type cell.
- `expiresAt` for new sigs defaults to `now + apertureConfig.SIGNATURE_DEFAULT_TTL_MS`.
- **Paste from scanner** opens `SignaturePasteDialog` with the active system pre-bound.

### Depends On
- `WormholeTypeSelect`, `SignatureGroupSelect`, `ConnectionSelect`, `SiteTypeCombobox`
- `SignaturePasteDialog` (`@/components/dialogs/SignaturePasteDialog`)
- `Card`, `Button`, `Input` from `@/components/ui/*`
- `labelForSignatureGroupKey` from `@/lib/map/signatureGroups`
- `formatRelativeFromMs`, `formatAgoFromMs` from `@/lib/map/relativeTime`
- `fetchWormholeTypes` from `@/lib/map/client` (target-class + jump-mass-band map for the Leads-to filter and connection-size auto-set)
- `apertureConfig` (`SIGNATURE_DEFAULT_TTL_MS`) from `aperture.config`
- Types: `MapConnectionEdge`, `MapEventPayload`, `MapSignature`, `MapSystemNode`, `SignatureGroupKey` from `@/types`; body types from `@/lib/map/client`
