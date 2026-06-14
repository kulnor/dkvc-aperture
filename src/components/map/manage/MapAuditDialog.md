## MapAuditDialog

**Purpose:** Wider dialog hosting the in-map audit console.
**File:** `src/components/map/manage/MapAuditDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Dialog visibility |
| onOpenChange | (open: boolean) => void | yes | Visibility setter |
| mapId | string | yes | Map whose audit feed is shown |
| mapName | string | yes | Shown in the dialog description |

### Behaviour & Interactions
- Renders `MapAuditBrowser` only while `open`, so its auto-refresh poll doesn't run in the background.
- Launched from the `MapCanvas` toolbar "Audit log" button, which is shown only to `canManageMap` holders; the feed is gated server-side regardless.
