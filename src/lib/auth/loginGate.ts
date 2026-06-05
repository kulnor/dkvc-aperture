// NOTE: deliberately no `import 'server-only'` — mirrors `resolveAuthz.ts`.
// Reachable from the Auth.js `signIn` callback (and tested under plain Node via
// tsx/vitest), so it must load without the `react-server` resolver condition.
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { apAccessGrant, apCharacter, apInstance, apInstanceOwner } from '@/db/schema';

/**
 * The login gate that the Auth.js `signIn`
 * callback consults to decide — **before any session/JWT is issued** — whether a
 * character may sign in.
 *
 * The check is DB-only: the caller (`src/lib/auth.ts`) resolves the character's
 * corp/alliance via a public ESI lookup and passes them in. When that lookup
 * fails the caller passes `null` for both, degrading the gate to character-level
 * checks (a known character with a direct grant, or the bootstrap path, still
 * gets in; an owner/corp/alliance-only entitlement is denied until ESI recovers).
 */

export interface LoginPrincipals {
  characterId: bigint;
  /** EVE corporation id, or `null` when the affiliation lookup failed. */
  corporationId: bigint | null;
  /** EVE alliance id, or `null` when unaffiliated / lookup failed. */
  allianceId: bigint | null;
}

/**
 * Read the instance-wide access mode from the `ap_instance` singleton.
 * Defaults to `'restricted'` when the row is absent (a fresh, unconfigured
 * deployment is locked down, not open).
 */
export async function getAccessMode(): Promise<'open' | 'restricted'> {
  const [row] = await db
    .select({ accessMode: apInstance.accessMode })
    .from(apInstance)
    .where(eq(apInstance.id, 1));
  return row?.accessMode ?? 'restricted';
}

/**
 * Decide whether a character may sign in. May insert a bootstrap `admin` grant
 * as a side effect (see the bootstrap branch below).
 *
 * Order of checks under `restricted` mode:
 *   1. owner-entity membership (corp/alliance in `ap_instance_owner`);
 *   2. an unexpired instance-scoped `login`/`admin`/`manage` grant for the
 *      character, its corp, or its alliance;
 *   3. bootstrap — a completely unconfigured instance admits the first caller
 *      and records them as the bootstrap super-admin;
 *   4. otherwise deny.
 */
export async function isLoginAllowed(p: LoginPrincipals): Promise<boolean> {
  if ((await getAccessMode()) === 'open') return true;

  if (await isOwnerMember(p)) return true;
  if (await hasInstanceGrant(p)) return true;
  if (await tryBootstrap(p.characterId)) return true;

  return false;
}

/** Whether the character's corp or alliance owns this deployment. */
async function isOwnerMember(p: LoginPrincipals): Promise<boolean> {
  const candidates: Array<{ kind: 'corporation' | 'alliance'; id: bigint }> = [];
  if (p.corporationId != null) candidates.push({ kind: 'corporation', id: p.corporationId });
  if (p.allianceId != null) candidates.push({ kind: 'alliance', id: p.allianceId });
  if (candidates.length === 0) return false;

  const rows = await db
    .select({ principalId: apInstanceOwner.principalId })
    .from(apInstanceOwner)
    .where(
      or(
        ...candidates.map((c) =>
          and(
            eq(apInstanceOwner.principalKind, c.kind),
            eq(apInstanceOwner.principalId, c.id),
          ),
        ),
      ),
    );
  return rows.length > 0;
}

/**
 * Whether the character (or its corp/alliance) holds an unexpired instance-scoped
 * `login`/`admin`/`manage` grant. `admin`/`manage` imply login — anyone trusted
 * to administer can obviously sign in.
 */
async function hasInstanceGrant(p: LoginPrincipals): Promise<boolean> {
  const principals: Array<{ kind: 'character' | 'corporation' | 'alliance'; id: bigint }> = [
    { kind: 'character', id: p.characterId },
  ];
  if (p.corporationId != null) principals.push({ kind: 'corporation', id: p.corporationId });
  if (p.allianceId != null) principals.push({ kind: 'alliance', id: p.allianceId });

  const rows = await db
    .select({ id: apAccessGrant.id })
    .from(apAccessGrant)
    .where(
      and(
        eq(apAccessGrant.scope, 'instance'),
        inArray(apAccessGrant.capability, ['login', 'admin', 'manage']),
        or(isNull(apAccessGrant.expiresAt), gt(apAccessGrant.expiresAt, sql`now()`)),
        or(
          ...principals.map((p) =>
            and(
              eq(apAccessGrant.principalKind, p.kind),
              eq(apAccessGrant.principalId, p.id),
            ),
          ),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Bootstrap safety net. When the instance is *completely* unconfigured — zero
 * owners, zero instance-scoped grants, and no existing `admin` character — admit
 * the first caller and record them as a permanent `admin` grant so the resync
 * chain (`jwt` → `syncCharacterAuthz` → `resolveAuthzLevel`) caches
 * `authz_level='admin'`. Prevents a permanent lockout on a restricted instance
 * that nobody has configured via `/setup` yet.
 *
 * Two simultaneous first-logins can both observe "unconfigured" and both write a
 * bootstrap grant; that race is bounded by the grant's unique constraint
 * (`onConflictDoNothing`) and is acceptable — either way the instance ends up
 * with at least one super-admin. No locking.
 *
 * @returns `true` if the bootstrap grant was applicable (caller admitted).
 */
async function tryBootstrap(characterId: bigint): Promise<boolean> {
  const ownerRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apInstanceOwner);
  if ((ownerRows[0]?.count ?? 0) > 0) return false;

  const grantRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apAccessGrant)
    .where(eq(apAccessGrant.scope, 'instance'));
  if ((grantRows[0]?.count ?? 0) > 0) return false;

  const adminRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apCharacter)
    .where(eq(apCharacter.authzLevel, 'admin'));
  if ((adminRows[0]?.count ?? 0) > 0) return false;

  await db
    .insert(apAccessGrant)
    .values({
      principalKind: 'character',
      principalId: characterId,
      scope: 'instance',
      mapId: null,
      capability: 'admin',
      note: 'bootstrap',
    })
    .onConflictDoNothing();
  return true;
}
