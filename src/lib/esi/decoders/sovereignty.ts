import { z } from 'zod';

/**
 * `getSovereigntyMap` → `GetSovereigntySystems` (`/sovereignty/systems`).
 *
 * The 2026 ESI surface nests the owner inside a `claim` object whose shape is
 * a `oneOf` discriminated by which key is present: `faction` (NPC/faction-held),
 * `alliance` (player sovereignty, also carries the holding corporation), or
 * `unclaimed`. We flatten each system back to the legacy
 * `{ system_id, faction_id?, alliance_id?, corporation_id? }` row the
 * sov-refresh job upserts, so unclaimed systems collapse to an all-null-owner
 * row exactly as the previous flat endpoint's owner-less entries did — the
 * consumer (`sovFwRefresh`) and `EsiSovereigntyMap` are unchanged.
 *
 * The alliance claim carries more fields than we use (sovereignty hub,
 * development, vulnerability window, …); they are accepted permissively.
 */
const sovereigntyClaimSchema = z
  .object({
    faction: z.object({ faction_id: z.number().int() }).optional(),
    alliance: z
      .object({
        alliance_id: z.number().int(),
        corporation_id: z.number().int(),
      })
      .loose()
      .optional(),
    unclaimed: z.boolean().optional(),
  })
  .loose();

export const sovereigntyMapSchema = z
  .object({
    solar_systems: z.array(
      z.object({
        solar_system_id: z.number().int(),
        claim: sovereigntyClaimSchema,
      }),
    ),
  })
  .transform(({ solar_systems }) =>
    solar_systems.map((s) => ({
      system_id: s.solar_system_id,
      faction_id: s.claim.faction?.faction_id,
      alliance_id: s.claim.alliance?.alliance_id,
      corporation_id: s.claim.alliance?.corporation_id,
    })),
  );

export const factionWarSystemsSchema = z.array(
  z.object({
    solar_system_id: z.number().int(),
    owner_faction_id: z.number().int().optional(),
    occupier_faction_id: z.number().int().optional(),
    contested: z.string().nullable().optional(),
    victory_points: z.number().int().optional(),
    victory_points_threshold: z.number().int().optional(),
  }),
);

export type EsiSovereigntyMap = z.infer<typeof sovereigntyMapSchema>;
export type EsiFactionWarSystems = z.infer<typeof factionWarSystemsSchema>;
