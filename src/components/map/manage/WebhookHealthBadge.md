## WebhookHealthBadge

**Purpose:** Compact status pill for a single `ap_map_webhook` row, derived from the dispatcher's observability columns.
**File:** `src/components/map/manage/WebhookHealthBadge.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| lastStatus | number \| null | yes | HTTP status of the last delivery; null when never attempted |
| consecutiveFailures | number | yes | Current failure streak |
| lastError | string \| null | yes | Last failure's truncated error (title tooltip when failing) |

### Renders
One of three pills: red "N consecutive failures" (`consecutiveFailures > 0`), grey "Untested" (`lastStatus === null`), or green "OK (status)".
