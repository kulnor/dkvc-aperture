## incursions.ts

**Purpose:** Zod decoder for the `getIncursions` (`get_incursions`) ESI response.
**File:** `src/lib/esi/decoders/incursions.ts`

---

### incursionsSchema
Array of `{ constellation_id, faction_id, has_boss, infested_solar_systems: number[], influence, staging_solar_system_id, state, type }`. Parsed by the `incursion-refresh` job before upserting into `universe_incursion`.

**Type:** `EsiIncursions = z.infer<typeof incursionsSchema>`.
