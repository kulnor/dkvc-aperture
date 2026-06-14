import { z } from 'zod';

/**
 * `getAlliance` → `get_alliances_alliance_id`. Public alliance info. Read by
 * `syncCharacterAuthz` to cache `executor_corporation_id` on `ap_alliance`,
 * which the derived-authority model uses to decide whose Directors may manage
 * the alliance's maps.
 *
 * `executor_corporation_id` is absent in the swagger schema for a closed or
 * dissolving alliance (no executor), so it is optional here. The swagger schema
 * is wider (creator_id, date_founded, faction_id, …); only the consumed fields
 * are required, the rest accepted permissively.
 */
export const allianceSchema = z
  .object({
    name: z.string(),
    executor_corporation_id: z.number().int().positive().optional(),
  })
  .loose();

export type EsiAlliance = z.infer<typeof allianceSchema>;
