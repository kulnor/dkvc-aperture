import { z } from 'zod';

/**
 * `getCharacter` → `get_characters_character_id`. Public character profile.
 * Reads `corporation_id` / `alliance_id` here to keep `ap_character`
 * affiliation columns in sync alongside the role/title resync.
 *
 * The swagger schema is wider (security_status, birthday, faction_id, …); only
 * the fields consumed are required, the rest are accepted permissively.
 */
export const characterPublicSchema = z
  .object({
    name: z.string(),
    corporation_id: z.number().int().positive(),
    alliance_id: z.number().int().positive().optional(),
  })
  .loose();

export type EsiCharacterPublic = z.infer<typeof characterPublicSchema>;

/**
 * `getCharacterRoles` → `get_characters_character_id_roles`. CCP-defined
 * corporation role memberships. `roles` is the "main" set; the three location-
 * scoped variants list the same role names where granted only at HQ / base /
 * other offices. A character whose `roles` contains
 * `apertureConfig.AUTHZ_ADMIN_ROLE` ('Director') has `ap_character.is_director`
 * set, which carries corp/alliance map-management authority (`canManageMap`);
 * it does not raise `authz_level`.
 *
 * All four arrays are optional in the swagger schema and absent when the
 * character has no corporation roles at all (e.g. line members of an NPC corp).
 */
export const characterRolesSchema = z
  .object({
    roles: z.array(z.string()).optional(),
    roles_at_hq: z.array(z.string()).optional(),
    roles_at_base: z.array(z.string()).optional(),
    roles_at_other: z.array(z.string()).optional(),
  })
  .loose();

export type EsiCharacterRoles = z.infer<typeof characterRolesSchema>;

/**
 * `getCharacterTitles` → `get_characters_character_id_titles`. Custom titles
 * the character holds in their corp. The list may be empty for line members.
 * Each entry is mirrored into an `ap_role(source='corp_title')` row so
 * `ap_map_role_access` can grant per-map access by title.
 *
 * `name` is the corp-author chosen string and may contain HTML tags from the
 * in-game editor (CCP does not strip them) — consumers must treat it as
 * untrusted text.
 */
export const characterTitleSchema = z.object({
  title_id: z.number().int().nonnegative(),
  name: z.string(),
});

export const characterTitlesSchema = z.array(characterTitleSchema);

export type EsiCharacterTitle = z.infer<typeof characterTitleSchema>;
export type EsiCharacterTitles = z.infer<typeof characterTitlesSchema>;
