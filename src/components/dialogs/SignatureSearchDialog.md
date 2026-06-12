## SignatureSearchDialog

**Purpose:** Modal dialog for searching and filtering signatures across all systems on the currently-open map.
**File:** `src/components/dialogs/SignatureSearchDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state |
| onOpenChange | (open: boolean) => void | yes | Open-state setter |
| signatures | MapSignature[] | yes | All map signatures from `viewData` |
| systems | MapSystemNode[] | yes | All map systems from `viewData` |
| filters | SigSearchFilters | yes | Filter state owned by `MapCanvas` (persists between opens) |
| onFiltersChange | (f: SigSearchFilters) => void | yes | Updates filter state in `MapCanvas` |
| onNavigate | (systemId: string, sigId: string) => void | yes | Closes dialog, centers canvas, selects system, starts row flash |

### Renders
A `max-w-3xl` dialog with a labelled filter bar (Name text input, Group select, Max age input, System class toggle buttons) and a scrollable results table. Columns: Group, Sig ID, System (alias ?? name), Security, Name, Age (from `createdAt`), action button. Column headers for Sig, System, and Age are sortable (click to toggle asc/desc). A result count is shown below the table. The results container has a `min-h-48` so the dialog doesn't snap when filters change the row count.

### Behaviour & Interactions
- All filtering and sorting is done synchronously via `buildSigSearchResults` from `@/lib/map/sigSearch`. No server fetch — data is always live from `viewData`.
- The Name input maintains local draft state (`inputName`) and debounces propagation to `onFiltersChange` at 150 ms to prevent per-keystroke table redraws. The latest `filters` object is read via a ref inside the debounce callback so group/age/class changes are never lost.
- Filter state is owned by `MapCanvas` so the filters persist when the dialog is closed and reopened.
- Age is computed from `sig.createdAt` (not `updatedAt`).
- Clicking the → button on a result row calls `onNavigate(system.id, sig.id)`, which closes the dialog, selects the system, centers the canvas, and starts a 3-second row flash in `SignatureModule`.
- Security class filter buttons are split into two labelled groups — **Wormhole** (C1–C6) and **K-Space** (HS/LS/NS/Poch) — and are multi-select toggles (empty = all classes). Each button's text color is always the system-class color from `systemClassColor`; when active, the border also takes that color. Abyssal (`A` / Thera) is intentionally excluded.
- The `_all` sentinel is used for the group `<Select>` "All Types" option (shown as "All Types" in the trigger), mapping to `groupKey: null` in `SigSearchFilters`.
- Sort state (`sortField`, `sortDir`) lives inside the dialog (not in `MapCanvas`) and resets when the dialog component unmounts.

### Depends On
- `buildSigSearchResults`, `SigSortField`, `SigSortDir` from `@/lib/map/sigSearch`
- `SIGNATURE_GROUP_CATALOG`, `labelForSignatureGroupKey` from `@/lib/map/signatureGroups`
- `formatAgoFromMs` from `@/lib/map/relativeTime`
- `systemClassColor` from `@/components/map/styling`
- `Dialog`, `Input`, `Button`, `Select` from `@/components/ui/*`
- Types: `MapSignature`, `MapSystemNode`, `SigSearchFilters`, `SignatureGroupKey` from `@/types`
