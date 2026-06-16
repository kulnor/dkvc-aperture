import { z } from 'zod';

/**
 * `getCharacterAffiliation` → `post_characters_affiliation`. Bulk character →
 * corporation/alliance/faction resolver. Unlike the public `getCharacter`
 * profile (cached ~24h by ESI), affiliation is cached only ~1h, so it is the
 * source Aperture uses to keep `ap_character` corp/alliance fresh enough that a
 * pilot joining or leaving the owning corp gains/loses access within the hour.
 *
 * The request body is an array of character ids (≤1000); the response is an
 * array of one object per id. `corporation_id` is always present;
 * `alliance_id` / `faction_id` are absent when the character has none. The
 * swagger schema carries no extra fields but `.loose()` keeps us forward-safe.
 */
export const characterAffiliationEntrySchema = z
  .object({
    character_id: z.number().int().positive(),
    corporation_id: z.number().int().positive(),
    alliance_id: z.number().int().positive().optional(),
    faction_id: z.number().int().positive().optional(),
  })
  .loose();

export const characterAffiliationSchema = z.array(characterAffiliationEntrySchema);

export type EsiCharacterAffiliationEntry = z.infer<typeof characterAffiliationEntrySchema>;
export type EsiCharacterAffiliation = z.infer<typeof characterAffiliationSchema>;
