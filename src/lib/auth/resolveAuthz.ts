// NOTE: deliberately no `import 'server-only'` — mirrors `rights.ts`. This
// module is reachable from the same server-side surfaces (Auth.js callback,
// the `character-cleanup` job) and must load under plain Node (tsx) without the
// `react-server` resolver condition.
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { apAccessGrant } from '@/db/schema';

/**
 * The single resolver that decides a character's cached
 * `ap_character.authz_level`.
 *
 * The rule (load-bearing):
 *   - `authz_level` is only ever `member` or `admin`. Global `admin` is reached
 *     **only** via an explicit hand-assigned `ap_access_grant`
 *     (`scope='instance', capability='admin'`). Nothing else derives it.
 *   - Corp/alliance map-management authority is **not** an authz tier — it is
 *     the derived `ap_character.is_director` bit (persisted separately by
 *     `syncCharacterAuthz`) and consumed by `canManageMap` / `canCreateMap` in
 *     `rights.ts`. The EVE Director role therefore does not raise `authz_level`.
 */

export type AuthzLevel = 'member' | 'admin';

/**
 * Resolve the authz level for a character: `admin` iff an unexpired explicit
 * instance-scoped `capability='admin'` grant exists, else `member`.
 */
export async function resolveAuthzLevel(characterId: bigint): Promise<AuthzLevel> {
  return (await hasAdminGrant(characterId)) ? 'admin' : 'member';
}

/** Whether the character holds an unexpired instance-scoped `admin` grant. */
async function hasAdminGrant(characterId: bigint): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(apAccessGrant)
    .where(
      and(
        eq(apAccessGrant.principalKind, 'character'),
        eq(apAccessGrant.principalId, characterId),
        eq(apAccessGrant.scope, 'instance'),
        eq(apAccessGrant.capability, 'admin'),
        or(isNull(apAccessGrant.expiresAt), gt(apAccessGrant.expiresAt, sql`now()`)),
      ),
    )
    .limit(1);
  return row !== undefined;
}
