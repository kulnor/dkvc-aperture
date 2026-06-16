// NOTE: deliberately no `import 'server-only'` — reachable from the
// `character-cleanup` job task (which runs under bare `tsx` without Next's
// `react-server` resolver condition) and from the Auth.js `signIn` callback.
import { esiCall } from '@/lib/esi/client';
import { characterAffiliationSchema } from '@/lib/esi/decoders';

/**
 * Resolve characters → corporation/alliance via ESI's bulk affiliation endpoint
 * (`getCharacterAffiliation`, cached ~1h vs. ~24h for the public profile).
 *
 * The single source Aperture uses to keep `ap_character.corporation_id` /
 * `alliance_id` fresh enough that joining/leaving the owning corp grants/revokes
 * access within the hour. Token-less (`auth: 'none'`).
 *
 * ESI failures (`EsiBreakerOpenError`, `EsiDowntimeError`, `EsiHttpError`,
 * `EsiDecodeError`) propagate to the caller — callers decide whether to skip or
 * degrade, mirroring `syncCharacterAuthz`.
 */

/** ESI caps the affiliation POST body at 1000 character ids per request. */
const AFFILIATION_CHUNK_SIZE = 1000;

export interface CharacterAffiliation {
  corporationId: bigint;
  /** `null` when the character is in no alliance. */
  allianceId: bigint | null;
}

/**
 * Fetch affiliation for the given character ids, chunked to ESI's 1000-id limit.
 * Returns a map keyed by character id. Ids ESI omits from the response (rare —
 * e.g. a biomassed character) are simply absent from the map. An empty input
 * short-circuits without an ESI call.
 */
export async function fetchAffiliations(
  characterIds: bigint[],
): Promise<Map<bigint, CharacterAffiliation>> {
  const result = new Map<bigint, CharacterAffiliation>();
  if (characterIds.length === 0) return result;

  for (let i = 0; i < characterIds.length; i += AFFILIATION_CHUNK_SIZE) {
    const chunk = characterIds.slice(i, i + AFFILIATION_CHUNK_SIZE);
    const rows = await esiCall('getCharacterAffiliation', {
      schema: characterAffiliationSchema,
      body: chunk.map(Number),
    });
    for (const row of rows) {
      result.set(BigInt(row.character_id), {
        corporationId: BigInt(row.corporation_id),
        allianceId: row.alliance_id !== undefined ? BigInt(row.alliance_id) : null,
      });
    }
  }

  return result;
}
