## MapSettingsDialog

**Purpose:** Consolidated map edit / settings / management / import-export dialog, launched from the `MapCanvas` toolbar.
**File:** `src/components/dialogs/MapSettingsDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state. |
| onOpenChange | (open: boolean) => void | yes | Open-state setter. |
| mapId | string | yes | The open map's id. |
| settings | MapSettings | yes | Seed values (name/icon/scope/type + behavior/tagging flags) from `loadMapSettings`. |
| canManage | boolean | yes | Derived `canManageMap` — reveals the Behavior / Auto-tagging / Webhooks tabs. |
| systems | { id; name; alias }[] | yes | Visible map systems for the Auto-tagging Home picker. |
| onImported | (payloads: MapEventPayload[]) => void | yes | Folds imported event payloads onto the live canvas (wired to the canvas's `onBulkPaste`). |

### Renders
A tabbed dialog (`Tabs`): **General** (name + icon inputs, read-only scope/visibility), **Settings** (per-device display preferences — currently a low-contrast theme toggle), then — only when `canManage` — **Behavior** (`MapBehaviorForm`), **Auto-tagging** (`MapTaggingForm`), **Webhooks** (`MapWebhooksPanel`), then **Export** (download button), **Import** (file picker).

### Behaviour & Interactions
- General Save → `updateMapSettingsAction({ mapId, name, icon })` (`map_update`); empty icon trims to `null`. A name change reflects live on the canvas via the realtime `map.update` echo.
- Settings tab — per-device display preferences (no server round-trip). The **Low-contrast theme** checkbox reads/writes `aperture:low-contrast` via `readLowContrast`/`writeLowContrast` (`@/lib/lowContrast`), which toggles the `low-contrast` class on `<html>` live; off by default. A lazy `useState(readLowContrast)` initializer seeds the checkbox from localStorage on first render — safe because the panel only mounts once the dialog is opened (never during SSR). The root-layout inline script independently applies the class to `<html>` before paint on reload.
- Export → `exportMapOnServer({ mapId })`; on success builds a `Blob` and triggers a download named `aperture-map-<id>-<YYYY-MM-DD>.json`.
- Import → reads the chosen file, `JSON.parse`s it, posts via `importMapOnServer`; on success calls `onImported(payloads)` and toasts a summary, then resets the file input. Invalid JSON / schema-invalid files toast an error (the client wrapper handles HTTP errors).
- Scope/type are shown read-only (immutable post-create).
- **Management tabs (when `canManage`):** Behavior toggles, Auto-tagging config, and the Webhooks editor — all in-place, gated server-side by `canManageMap` regardless of the flag. The audit log lives in its own wider dialog (`MapAuditDialog`), not here.

### Emits / Calls
- `updateMapSettingsAction`, `exportMapOnServer`, `importMapOnServer`.
- `onImported(payloads)` after a successful import.

### Depends On
- `Dialog`, `Tabs`, `Button`, `Input` primitives; `sonner` toasts; lucide `Download`/`Save`/`Upload`.
- `@/lib/lowContrast` — `readLowContrast` / `writeLowContrast` for the Settings-tab low-contrast toggle.
- `MapBehaviorForm`, `MapTaggingForm`, `MapWebhooksPanel` (`@/components/map/manage/*`) — the management tabs.
