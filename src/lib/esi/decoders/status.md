## status.ts

**Purpose:** Zod decoder for the ESI server-status response.
**File:** `src/lib/esi/decoders/status.ts`

---

### `statusSchema`
Decodes `getStatus` → `get_status`: EVE server `players`, `server_version`, `start_time`, and optional `vip` (omitted when the server is not in VIP mode).

### `EsiStatus`
`z.infer<typeof statusSchema>`.
