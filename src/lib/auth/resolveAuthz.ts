// NOTE: deliberately no `import 'server-only'` — mirrors `rights.ts`. This
// module is reachable from the same server-side surfaces (Auth.js callback,
// the `character-cleanup` job) and must load under plain Node (tsx) without the
// `react-server` resolver condition.
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { apAccessGrant } from '@/db/schema';

/**
 * The single resolver that decides a character's cached
 * `ap_character.authz_level`.
 *
 * The rule (load-bearing):
 *   - **Any** in-game corp Director ⇒ corp-scoped `manager` — regardless of
 *     whether their corp owns the instance. Ownership (`ap_instance_owner`) is
 *     a *login-gating* concern and is intentionally NOT consulted here.
 *   - **Global `admin` is reachable only via an explicit hand-assigned
 *     `ap_access_grant` (`capability='admin'`).** Nothing derives it.
 *   - The result is the `max` of the derived level and the explicit grant level
 *     (`member < manager < admin`).
 *
 * `manager` is scoped to the actor's own corp downstream by
 * `adminVisibilityScope` / `mapScopeFilterFor` in `rights.ts`, which read
 * `ap_character.corporation_id` — so a foreign-corp Director lands in the admin
 * panel seeing only their own corp's maps & members, never global.
 */

export type AuthzLevel = 'member' | 'manager' | 'admin';

const AUTHZ_ORDINAL: Record<AuthzLevel, number> = {
  member: 0,
  manager: 1,
  admin: 2,
};

function maxLevel(a: AuthzLevel, b: AuthzLevel): AuthzLevel {
  return AUTHZ_ORDINAL[a] >= AUTHZ_ORDINAL[b] ? a : b;
}

export interface ResolveAuthzInput {
  characterId: bigint;
  /** Whether ESI reports the character holds the corp Director role. */
  isDirector: boolean;
}

/**
 * Resolve the authz level for a character. Reads `ap_access_grant` for explicit
 * instance-scoped admin/manage grants; combines with the Director-derived level.
 */
export async function resolveAuthzLevel(input: ResolveAuthzInput): Promise<AuthzLevel> {
  const derived: AuthzLevel = input.isDirector ? 'manager' : 'member';
  const explicit = await explicitGrantLevel(input.characterId);
  return maxLevel(derived, explicit ?? 'member');
}

/**
 * Highest unexpired instance-scoped grant for this character.
 * `admin` ⇒ `'admin'`; else `manage` ⇒ `'manager'`; else `null`.
 */
async function explicitGrantLevel(characterId: bigint): Promise<AuthzLevel | null> {
  const rows = await db
    .select({ capability: apAccessGrant.capability })
    .from(apAccessGrant)
    .where(
      and(
        eq(apAccessGrant.principalKind, 'character'),
        eq(apAccessGrant.principalId, characterId),
        eq(apAccessGrant.scope, 'instance'),
        inArray(apAccessGrant.capability, ['admin', 'manage']),
        or(isNull(apAccessGrant.expiresAt), gt(apAccessGrant.expiresAt, sql`now()`)),
      ),
    );
  if (rows.some((r) => r.capability === 'admin')) return 'admin';
  if (rows.some((r) => r.capability === 'manage')) return 'manager';
  return null;
}
