## SubchainDeletePrompt

**Purpose:** Non-blocking overlay to confirm deleting a wormhole subchain. The standard map-related "dialog" pattern — a dismissible card, not a modal.
**File:** `src/components/map/SubchainDeletePrompt.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| headName | string | yes | Display name of the head system (the far end of the doomed branch) |
| count | number | yes | Number of systems that will be removed (includes the head) |
| onConfirm | () => void | yes | Fired when the user confirms the subchain delete |
| onDismiss | () => void | yes | Fired when the user dismisses (X button) |
| lead | string | no | Leading question text before the head name. Defaults to `"Also delete the subchain beyond"` (the sig-delete offer). The context-menu flow passes `"Delete subchain beyond"`. |

### Renders
A small dismissible `Card` pinned to the canvas bottom-left (clear of `TransitSignaturePrompt` at top-left and the "Remove N" button at top-right). Header text "{lead} {headName}?" with an `X` dismiss button, and a destructive "Delete N systems" button.

### Behaviour & Interactions
- Purely presentational and stateless — visibility is controlled by the parent (`MapCanvas`) rendering it only while a prompt is pending.
- Mirrors the non-blocking pattern of `TransitSignaturePrompt`; deliberately not a modal, so the rest of the UI stays interactive. This is the standard for map-related dialogs (it replaced the blocking `SubchainDeleteDialog`).
- Serves both subchain-delete flows: the sig-delete offer (no canvas highlight — that would surface the "Remove N" button) and the context-menu confirm (`lead="Delete subchain beyond"`, where `MapCanvas` *does* highlight the doomed set and suppresses its own "Remove N" button while the prompt is up).

### Emits / Calls
- `onConfirm()` — parent runs `deleteSubchainOnServer` + `onBulkPaste`.
- `onDismiss()` — parent clears the pending prompt (and, for the context-menu flow, the highlight).

### Depends On
- `Card`, `Button` (shadcn/ui), `Scissors`/`X` (lucide-react)
