## SubchainDeletePrompt

**Purpose:** Non-blocking overlay offering to delete the wormhole subchain behind a "Leads to" signature that was just deleted.
**File:** `src/components/map/SubchainDeletePrompt.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| headName | string | yes | Display name of the head system (far end of the deleted sig's hole) |
| count | number | yes | Number of systems that will be removed (includes the head) |
| onConfirm | () => void | yes | Fired when the user confirms the subchain delete |
| onDismiss | () => void | yes | Fired when the user dismisses (X button) |

### Renders
A small dismissible `Card` pinned to the canvas bottom-left (clear of `TransitSignaturePrompt` at top-left and the "Remove N" button at top-right). Header text "Also delete the subchain beyond {headName}?" with an `X` dismiss button, and a destructive "Delete N systems" button.

### Behaviour & Interactions
- Purely presentational and stateless — visibility is controlled by the parent (`MapCanvas`) rendering it only while a prompt is pending.
- Mirrors the non-blocking pattern of `TransitSignaturePrompt`; deliberately not a modal, so the rest of the UI stays interactive.
- Does not highlight the doomed systems on the canvas (that would surface `MapCanvas`'s `selectedSystemIds.size > 1` "Remove N" button); the `count` conveys scope instead.

### Emits / Calls
- `onConfirm()` — parent runs `deleteSubchainOnServer` + `onBulkPaste`.
- `onDismiss()` — parent clears the pending prompt.

### Depends On
- `Card`, `Button` (shadcn/ui), `Scissors`/`X` (lucide-react)
