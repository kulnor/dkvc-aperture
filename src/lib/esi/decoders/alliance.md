## alliance.ts

**Purpose:** Zod decoder for the `getAlliance` (`get_alliances_alliance_id`) ESI response.
**File:** `src/lib/esi/decoders/alliance.ts`

---

### allianceSchema
`{ name, executor_corporation_id? }`, parsed `.loose()`. `executor_corporation_id` is optional — a closed/dissolving alliance has no executor. Read by `syncCharacterAuthz` to upsert the `ap_alliance` cache (executor corp drives alliance-map authority in `canManageMap`).

**Type:** `EsiAlliance = z.infer<typeof allianceSchema>`.
