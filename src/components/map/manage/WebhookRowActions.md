## WebhookRowActions

**Purpose:** Per-row action cluster (test / reset / edit / delete) for a webhook in the in-map Webhooks panel.
**File:** `src/components/map/manage/WebhookRowActions.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| webhook | { id, channel, event, url, username, consecutiveFailures } | yes | Row data |
| onChanged | () => void | no | Called after any successful mutation so the panel refetches |

### Behaviour & Interactions
- Test-fire → `testWebhook`; Reset (only shown when `consecutiveFailures > 0`) → `resetWebhookFailures`; Edit opens a dialog wrapping `WebhookForm mode="edit"`; Delete opens a confirm dialog → `deleteWebhook`.
- Every successful action fires `onChanged`.

### Depends On
- `testWebhook` / `resetWebhookFailures` / `deleteWebhook` (`@/app/(app)/actions/webhooks`)
- `WebhookForm`, shadcn `Dialog` / `Button`
