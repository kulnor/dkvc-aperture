// NOTE: deliberately no `import 'server-only'` — this module is imported by
// `src/lib/realtime/wsServer.ts`, which runs in the custom Node entry (tsx)
// without Next.js's `react-server` resolver condition. Under plain Node the
// `server-only` default export throws on load. Every caller is server-side
// (API routes, Server Actions, the WS upgrade handler); we rely on that
// rather than the marker package.
import { and, eq, exists, isNull, or, sql } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { db } from '@/db/client';
import {
  apAlliance,
  apCharacter,
  apCharacterRole,
  apMap,
  apMapRoleAccess,
} from '@/db/schema';
import type { MapRight, MapType } from '@/types';

/**
 * The single rights module every controller imports. `requireSession`
 * still owns "is this user logged in"; this file answers "given an
 * authenticated character, can they perform action X on map Y".
 *
 * View rule (in order, first match wins):
 *   1. `authz_level='admin'` — global override, always wins.
 *   2. Owner match per `ap_map.type`:
 *        private  → `owner_character_id` matches the actor
 *        corp     → `owner_corporation_id` matches the actor's `corporation_id`
 *        alliance → `owner_alliance_id` matches the actor's `alliance_id`
 *   3. Role overlay — any `ap_character_role` row for the actor whose role
 *      appears in `ap_map_role_access` for the target map grants view access.
 *   4. Otherwise no access.
 *
 * Management (mutate) is the derived-authority model: a binary "can this
 * character manage this map" computed purely from EVE state + ownership
 * (`canManageMap`) — admin, the private map's owner, the owning corp's
 * Director, or the owning alliance's executor-corp Director. The corp-right
 * matrix no longer participates and the role overlay never unlocks mutation
 * (view only). The `MapRight` argument is retained on the mutate guards for the
 * future title-delegation overlay (R4) but is ignored at the baseline.
 *
 * Maps with all three owner columns NULL are treated as admin-only — defensive
 * default, surfaces unowned rows for repair.
 */

interface ActorRow {
  authzLevel: 'member' | 'admin';
  status: 'active' | 'kicked' | 'banned';
  corporationId: bigint | null;
  allianceId: bigint | null;
  isDirector: boolean;
}

async function loadActor(characterId: bigint): Promise<ActorRow | null> {
  const [row] = await db
    .select({
      authzLevel: apCharacter.authzLevel,
      status: apCharacter.status,
      corporationId: apCharacter.corporationId,
      allianceId: apCharacter.allianceId,
      isDirector: apCharacter.isDirector,
    })
    .from(apCharacter)
    .where(eq(apCharacter.id, characterId));
  return row ?? null;
}

interface MapRow {
  type: 'private' | 'corp' | 'alliance';
  ownerCharacterId: bigint | null;
  ownerCorporationId: bigint | null;
  ownerAllianceId: bigint | null;
}

async function loadMap(mapId: bigint): Promise<MapRow | null> {
  const [row] = await db
    .select({
      type: apMap.type,
      ownerCharacterId: apMap.ownerCharacterId,
      ownerCorporationId: apMap.ownerCorporationId,
      ownerAllianceId: apMap.ownerAllianceId,
    })
    .from(apMap)
    .where(and(eq(apMap.id, mapId), isNull(apMap.deletedAt)));
  return row ?? null;
}

function isOwner(actor: ActorRow, map: MapRow, characterId: bigint): boolean {
  switch (map.type) {
    case 'private':
      return map.ownerCharacterId !== null && map.ownerCharacterId === characterId;
    case 'corp':
      return (
        map.ownerCorporationId !== null &&
        actor.corporationId !== null &&
        map.ownerCorporationId === actor.corporationId
      );
    case 'alliance':
      return (
        map.ownerAllianceId !== null &&
        actor.allianceId !== null &&
        map.ownerAllianceId === actor.allianceId
      );
  }
}

async function hasRoleAccess(characterId: bigint, mapId: bigint): Promise<boolean> {
  const [row] = await db
    .select({ exists: sql<number>`1` })
    .from(apMapRoleAccess)
    .innerJoin(
      apCharacterRole,
      eq(apCharacterRole.roleId, apMapRoleAccess.roleId),
    )
    .where(
      and(
        eq(apMapRoleAccess.mapId, mapId),
        eq(apCharacterRole.characterId, characterId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Is the character allowed to *see* this map's data?
 * Returns `false` for non-existent or soft-deleted maps (treat as "no map").
 */
export async function canViewMap(characterId: bigint, mapId: bigint): Promise<boolean> {
  const actor = await loadActor(characterId);
  if (!actor || actor.status !== 'active') return false;
  if (actor.authzLevel === 'admin') return true;

  const map = await loadMap(mapId);
  if (!map) return false;

  // Unowned map (all three owner columns NULL) → admin only.
  if (
    map.ownerCharacterId === null &&
    map.ownerCorporationId === null &&
    map.ownerAllianceId === null
  ) {
    return false;
  }

  if (isOwner(actor, map, characterId)) return true;
  if (await hasRoleAccess(characterId, mapId)) return true;
  return false;
}

/**
 * Is the character allowed to mutate this map? Baseline derived-authority:
 * mutation authority is the binary `canManageMap` — admin, the private map's
 * owner, the owning corp's Director, or the owning alliance's executor-corp
 * Director. The `right` argument is retained for the future title-delegation
 * overlay (R4) but is ignored at the baseline; neither the corp-right matrix
 * nor the role overlay unlocks mutation.
 *
 * `map_create` has no target map and must be checked via `canCreateMap`.
 */
export async function canMutateMap(
  characterId: bigint,
  mapId: bigint,
  right: MapRight,
): Promise<boolean> {
  if (right === 'map_create') {
    throw new Error('canMutateMap: map_create must be checked via canCreateMap');
  }
  return canManageMap(characterId, mapId);
}

/**
 * Can this character create a map of the given `type`? Derived-authority:
 *   private  → any active character
 *   corp     → actor.is_director (owned to actor.corporation_id)
 *   alliance → actor.is_director && actor.corporation_id == executorCorpOf(actor.alliance_id)
 * Admin may create anything. No target map; the caller resolves the owner FK
 * from the actor's affiliation.
 */
export async function canCreateMap(characterId: bigint, type: MapType): Promise<boolean> {
  const actor = await loadActor(characterId);
  if (!actor || actor.status !== 'active') return false;
  if (actor.authzLevel === 'admin') return true;

  switch (type) {
    case 'private':
      return true;
    case 'corp':
      return actor.isDirector && actor.corporationId !== null;
    case 'alliance': {
      if (!actor.isDirector || actor.allianceId === null || actor.corporationId === null) {
        return false;
      }
      const executor = await executorCorpOf(actor.allianceId);
      return executor !== null && executor === actor.corporationId;
    }
  }
}

// ---------------------------------------------------------------------------
// Derived-authority model (permissions multi-tenant).
//
// Map-management authority is a pure function of EVE state + ownership:
// members own their private maps, corp Directors manage their corp's maps, and
// the alliance executor corp's Directors manage alliance maps. This is the live
// mutate path — `canMutateMap` / `requireMapRight` / `assertMapRight` all
// resolve to `canManageMap`, and `canCreateMap` is the typed create gate. The
// corp-right matrix no longer participates.
// ---------------------------------------------------------------------------

/**
 * The executor corporation of an alliance, read from the `ap_alliance` cache
 * (`syncCharacterAuthz` keeps it fresh from ESI). Returns `null` when the
 * alliance is unknown or has no executor (closed/dissolving).
 */
export async function executorCorpOf(allianceId: bigint): Promise<bigint | null> {
  const [row] = await db
    .select({ executorCorporationId: apAlliance.executorCorporationId })
    .from(apAlliance)
    .where(eq(apAlliance.id, allianceId));
  return row?.executorCorporationId ?? null;
}

/**
 * Can the actor *manage* this map (settings, webhooks, audit, the full mutation
 * surface) under the derived-authority model? Binary — no per-right granularity
 * at the baseline (title-delegation is the future R4 overlay).
 *
 *   admin                                   → true (deployment operator)
 *   private  → owner_character_id == actor
 *   corp     → actor.is_director && actor.corporation_id == owner_corporation_id
 *   alliance → actor.is_director && actor.alliance_id == owner_alliance_id
 *              && actor.corporation_id == executorCorpOf(owner_alliance_id)
 *   all-NULL owner                          → admin only (defensive default)
 */
export async function canManageMap(characterId: bigint, mapId: bigint): Promise<boolean> {
  const actor = await loadActor(characterId);
  if (!actor || actor.status !== 'active') return false;
  if (actor.authzLevel === 'admin') return true;

  const map = await loadMap(mapId);
  if (!map) return false;

  switch (map.type) {
    case 'private':
      return map.ownerCharacterId !== null && map.ownerCharacterId === characterId;
    case 'corp':
      return (
        actor.isDirector &&
        map.ownerCorporationId !== null &&
        actor.corporationId !== null &&
        map.ownerCorporationId === actor.corporationId
      );
    case 'alliance': {
      if (
        !actor.isDirector ||
        map.ownerAllianceId === null ||
        actor.allianceId === null ||
        actor.corporationId === null ||
        map.ownerAllianceId !== actor.allianceId
      ) {
        return false;
      }
      const executor = await executorCorpOf(map.ownerAllianceId);
      return executor !== null && executor === actor.corporationId;
    }
  }
}

/** True iff the active character has `authz_level='admin'` and is `active`. */
export async function isAdmin(session: Session | null | undefined): Promise<boolean> {
  if (!session?.characterId) return false;
  const actor = await loadActor(BigInt(session.characterId));
  return actor !== null && actor.status === 'active' && actor.authzLevel === 'admin';
}

/** Tuple-result helper for API routes — mirrors the existing `guardMap` shape. */
export type RightGuard =
  | { ok: true; characterId: bigint }
  | { ok: false; status: 401 | 403 | 404; error: string };

/**
 * One-call gate for an API route handler. Resolves the session, the map
 * existence, and the right check in order. Returns a discriminated result
 * the caller can pass straight into `Response.json`.
 *
 * 401 — no session.
 * 404 — map missing / soft-deleted, OR the actor has no view access (avoid
 *       leaking existence; a 403 here would leak it).
 * 403 — the actor can see the map but lacks the right.
 */
export async function requireMapRight(
  session: Session | null | undefined,
  mapId: bigint,
  right: MapRight,
): Promise<RightGuard> {
  if (!session?.characterId) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }
  const characterId = BigInt(session.characterId);

  const canView = await canViewMap(characterId, mapId);
  if (!canView) {
    return { ok: false, status: 404, error: 'Map not found.' };
  }
  const canMutate = await canMutateMap(characterId, mapId, right);
  if (!canMutate) {
    return { ok: false, status: 403, error: 'Forbidden.' };
  }
  return { ok: true, characterId };
}

/** View-only guard for read endpoints. */
export async function requireMapView(
  session: Session | null | undefined,
  mapId: bigint,
): Promise<RightGuard> {
  if (!session?.characterId) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }
  const characterId = BigInt(session.characterId);
  const canView = await canViewMap(characterId, mapId);
  if (!canView) {
    return { ok: false, status: 404, error: 'Map not found.' };
  }
  return { ok: true, characterId };
}

/**
 * Server Action variant. Throws on failure so the call site can `await` it
 * inline. Use in Server Actions where a `redirect()` or thrown error is the
 * natural response (e.g. delete a map you don't own).
 */
export async function assertMapRight(
  session: Session | null | undefined,
  mapId: bigint,
  right: MapRight,
): Promise<bigint> {
  const guard = await requireMapRight(session, mapId, right);
  if (!guard.ok) {
    throw new RightAssertionError(guard.status, guard.error);
  }
  return guard.characterId;
}

export class RightAssertionError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = 'RightAssertionError';
  }
}

/**
 * SQL predicate for `listViewableMaps`. Returns a `where` clause that filters
 * `ap_map` rows to those the actor can view. Returns `undefined` for admins
 * (no filter — callers should still apply `isNull(deletedAt)`).
 */
export async function viewableMapPredicate(characterId: bigint) {
  const actor = await loadActor(characterId);
  if (!actor || actor.status !== 'active') {
    // No-actor predicate: tautologically false so the query returns no rows.
    return sql`false`;
  }
  if (actor.authzLevel === 'admin') {
    return undefined;
  }

  const ownerMatches: Array<ReturnType<typeof eq>> = [
    and(eq(apMap.type, 'private'), eq(apMap.ownerCharacterId, characterId))!,
  ];
  if (actor.corporationId !== null) {
    ownerMatches.push(
      and(eq(apMap.type, 'corp'), eq(apMap.ownerCorporationId, actor.corporationId))!,
    );
  }
  if (actor.allianceId !== null) {
    ownerMatches.push(
      and(eq(apMap.type, 'alliance'), eq(apMap.ownerAllianceId, actor.allianceId))!,
    );
  }

  // `EXISTS` join against role overlay.
  const roleAccess = exists(
    db
      .select({ one: sql<number>`1` })
      .from(apMapRoleAccess)
      .innerJoin(
        apCharacterRole,
        eq(apCharacterRole.roleId, apMapRoleAccess.roleId),
      )
      .where(
        and(
          eq(apMapRoleAccess.mapId, apMap.id),
          eq(apCharacterRole.characterId, characterId),
        ),
      ),
  );

  return or(...ownerMatches, roleAccess);
}

export type AdminVisibilityScope = { kind: 'global' };

/**
 * Gate primitive for the `/admin` operator console. Returns `{ kind: 'global' }`
 * for an active global admin, else `null` (so the layout / actions can redirect
 * or 403). `/admin` is operator-only now — corp Directors manage their maps
 * in-place via `canManageMap`, not through this panel — so there is no
 * corp-scoped variant; the panel is always global.
 */
export async function adminVisibilityScope(
  session: Session | null | undefined,
): Promise<AdminVisibilityScope | null> {
  return (await isAdmin(session)) ? { kind: 'global' } : null;
}

/** Re-export for ergonomic imports at call sites. */
export type { Session };
