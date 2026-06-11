import { z } from 'zod';

/**
 * `getIncursions` → `get_incursions`. Lists active incursions; each entry is
 * constellation-scoped and lists the solar systems it infests. Refreshed by the
 * `incursion-refresh` job into `universe_incursion`.
 */
export const incursionsSchema = z.array(
  z.object({
    constellation_id: z.number().int(),
    faction_id: z.number().int(),
    has_boss: z.boolean(),
    infested_solar_systems: z.array(z.number().int()),
    influence: z.number(),
    staging_solar_system_id: z.number().int(),
    state: z.string(),
    type: z.string(),
  }),
);

export type EsiIncursions = z.infer<typeof incursionsSchema>;
