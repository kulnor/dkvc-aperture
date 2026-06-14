## WebhookForm

**Purpose:** Controlled create/edit form for a single `ap_map_webhook` row, used in the in-map Webhooks panel.
**File:** `src/components/map/manage/WebhookForm.tsx`

### Props
Discriminated on `mode`:
- `mode: 'create'` — `{ mapId: string; onCreated?: () => void }`
- `mode: 'edit'` — `{ webhook: { id, channel, event, url, username }; onDone?: () => void }`

### Behaviour & Interactions
- Create calls `createWebhook` (`@/app/(app)/actions/webhooks`); on success resets the fields and fires `onCreated` (panel refetches).
- Edit calls `updateWebhook`; channel + event are immutable (shown read-only); on success fires `onDone`.
- URL is required client-side; the action re-validates.

### Depends On
- `createWebhook` / `updateWebhook` server actions
- shadcn `Select`, `Input`, `Button`
