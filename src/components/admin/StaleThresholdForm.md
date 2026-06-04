## StaleThresholdForm

**Purpose:** Global-admin client form on `/admin/settings` for the instance-wide default stale-signature threshold.
**File:** `src/components/admin/StaleThresholdForm.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| initialMinutes | number | yes | Current `ap_instance.stale_signature_threshold_minutes`, shown converted to hours. |

### Renders
A labelled number input ("Stale-signature threshold (hours)") and a Save button.

### Behaviour & Interactions
- Edited in hours; converted to minutes (`Math.round(hours*60)`) on save. Rejects non-positive input with a toast before calling the server.
- Save calls `adminSetStaleSignatureThreshold({ minutes })` in a transition; success toasts and re-normalises the field, failure toasts the error (e.g. forbidden, out of range — the action gates to global admins and validates `[1, 10080]`).

### Emits / Calls
- `adminSetStaleSignatureThreshold({ minutes })` — from `@/app/(admin)/actions/settings`.

### Depends On
- `Button` UI primitive; `sonner` toast.
