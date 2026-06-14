## GET /api/map/[mapId]/webhooks

**Purpose:** Read-only webhook list feeding the in-map Settings → Webhooks tab.
**File:** `src/app/api/map/[mapId]/webhooks/route.ts`

---

### GET(request, { params: { mapId } })
Returns the map's `ap_map_webhook` rows ordered by `(event, id)`.

**Access:** `requireMapView` (404 on missing/unviewable map — no existence leak) then `canManageMap(characterId, mapId)` (403 for a plain member with view access). Mirrors the gate on the webhook Server Actions and the audit route.

**Returns:** `{ ok: true, data: { webhooks } }` where each webhook is `{ id, channel, event, url, username, lastStatus, lastError, lastAttemptedAt, consecutiveFailures }`. The **full** `url` is returned (the manager needs it to edit); the client masks it in the table.

Runtime: `nodejs`.
