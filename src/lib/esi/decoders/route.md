## route.ts

**Purpose:** Zod decoder for the ESI route response.
**File:** `src/lib/esi/decoders/route.ts`

---

### `routeSchema`
Decodes `getRoute` → `get_route_origin_destination`: an ordered array of solar-system ids from origin to destination (inclusive).

### `EsiRoute`
`z.infer<typeof routeSchema>`.
