## MapSettingsDialog

**Purpose:** Consolidated map edit / settings / import-export dialog, launched from the `MapCanvas` toolbar.
**File:** `src/components/dialogs/MapSettingsDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state. |
| onOpenChange | (open: boolean) => void | yes | Open-state setter. |
| mapId | string | yes | The open map's id. |
| settings | MapSettings | yes | Seed values (name/icon/scope/type + toggles + tagScheme/homeMapSystemId/exemptHomeStaticFromTag) from `loadMapSettings`. |
| onImported | (payloads: MapEventPayload[]) => void | yes | Folds imported event payloads onto the live canvas (wired to the canvas's `onBulkPaste`). |
| canConfigureTagging | boolean | yes | Owner/admin gate: shows the **Tagging** tab. |
| systems | Pick<MapSystemNode,'id'\|'name'\|'alias'>[] | yes | Visible systems, for the Home-system picker. |

### Renders
A tabbed dialog (`Tabs`): **General** (name + icon inputs, read-only scope/visibility), **Settings** (toggle checkboxes), **Tagging** (owner/admin only — scheme select + Home picker + "Exempt home static from auto-tag" checkbox), **Export** (download button), **Import** (file picker).

### Behaviour & Interactions
- General Save → `updateMapSettingsAction({ mapId, name, icon })` (`map_update`); empty icon trims to `null`. A name change reflects live on the canvas via the realtime `map.update` echo.
- Settings Save → `updateMapSettingsAction({ mapId, ...toggles })`.
- Tagging Save → `updateMapSettingsAction({ mapId, tagScheme, homeMapSystemId, exemptHomeStaticFromTag })` (owner/admin-gated server-side). Home picker disabled when scheme is `Off`; empty Home selection sends `null`. The exemption checkbox is enabled only under ABC with a Home set (`canExempt`); the server reconciles tags after the save. Config propagates to other clients on next map load (not realtime).
- Export → `exportMapOnServer({ mapId })`; on success builds a `Blob` and triggers a download named `aperture-map-<id>-<YYYY-MM-DD>.json`.
- Import → reads the chosen file, `JSON.parse`s it, posts via `importMapOnServer`; on success calls `onImported(payloads)` and toasts a summary, then resets the file input. Invalid JSON / schema-invalid files toast an error (the client wrapper handles HTTP errors).
- Scope/type are shown read-only (immutable post-create). Webhooks are intentionally absent (admin-only).

### Emits / Calls
- `updateMapSettingsAction`, `exportMapOnServer`, `importMapOnServer`.
- `onImported(payloads)` after a successful import.

### Depends On
- `Dialog`, `Tabs`, `Button`, `Input` primitives; `sonner` toasts; lucide `Download`/`Save`/`Upload`.
