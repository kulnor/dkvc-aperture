## SubchainDeleteDialog

**Purpose:** Confirmation dialog for the delete-subchain action — names the systems that will be removed and gates the destructive commit.
**File:** `src/components/map/SubchainDeleteDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Whether the dialog is shown. |
| headName | string | yes | Display name of the head system the user acted on. |
| systemNames | string[] | yes | Display names of every system that will be removed (includes the head). |
| onConfirm | () => void | yes | Commit the deletion. |
| onCancel | () => void | yes | Dismiss without deleting (also fired on outside-press / Escape). |

### Renders
A centered Base UI dialog (`@/components/ui/dialog`) titled "Delete subchain" with a `Scissors` icon. The description names the head and the total count; when more than one system is affected, a scrollable bordered list of all names is shown. Footer has a ghost **Cancel** and a destructive **Delete N systems** button.

### Behaviour & Interactions
- Controlled via `open` + `onOpenChange` → `onCancel` on close. No internal open state.
- `showCloseButton={false}` — dismissal is via the explicit Cancel button / outside-press only.
- Singular/plural copy keys off `systemNames.length`; the list is hidden for a single-system delete (the description already names it).
- The affected systems are also highlighted on the canvas by the caller (`MapCanvas` selects them before opening), so this dialog is the second half of the "visual indication + confirm" flow.

### Depends On
- `@/components/ui/dialog` — `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`.
- `@/components/ui/button` — `Button` (ghost + destructive variants).
