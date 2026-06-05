// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import { apCharacter, apCorporation, apMap, apUser } from '@/db/schema';
import {
  adminVisibilityScope,
  canViewMap,
  characterScopeFilterFor,
  mapScopeFilterFor,
  type AdminVisibilityScope,
  type Session,
} from '@/lib/auth/rights';

/**
 * Manager corp-scoping acceptance gate.
 *
 * The headline rule: a corp Director is never a global admin. The
 * authz-resolution test proves the resolver caches `authz_level='manager'` for
 * any Director; this test proves the
 * *consequence* at the enforcement layer — a `manager` is corp-scoped and
 * cannot reach a foreign corp's maps, while only an explicit `admin` keeps the
 * global view. Drives the `rights.ts` scope primitives directly against real
 * Postgres (no resolver/ESI involvement — `authz_level` is seeded as the cache
 * the resolver would have written).
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test permissions-scope
 */
const run = process.env.RUN_DB_TESTS === '1';

// 99050xxx block — disjoint from permissions.test.ts (99000xxx), authz-resolution
// (99010xxx) and login-gate (99030xxx).
const CORP_OWN = 99059001n;
const CORP_FOREIGN = 99059002n;
const ALLIANCE_OWN = 99059003n;
const CORP_ADMIN = 99059004n;

const MANAGER_ID = 99050001n; // director-derived manager, corp OWN
const SUPERADMIN_ID = 99050002n; // explicit admin grant, in an unrelated corp
const PLAIN_ID = 99050003n; // plain member, corp OWN

let userId = 0;
let ownCorpMapId = 0n;
let foreignCorpMapId = 0n;

const characterIds = [MANAGER_ID, SUPERADMIN_ID, PLAIN_ID];
const corpIds = [CORP_OWN, CORP_FOREIGN, CORP_ADMIN];

describe.skipIf(!run)('Stage 6 — manager corp-scoping (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;

    await db.insert(apCorporation).values([
      { id: CORP_OWN, name: 'Own Corp', allianceId: ALLIANCE_OWN },
      { id: CORP_FOREIGN, name: 'Foreign Corp', allianceId: null },
      { id: CORP_ADMIN, name: 'Admin Corp', allianceId: null },
    ]);

    await db.insert(apCharacter).values([
      mkChar(MANAGER_ID, 'Director Manager', {
        authzLevel: 'manager',
        corporationId: CORP_OWN,
        allianceId: ALLIANCE_OWN,
      }),
      // The super-admin sits in a corp that owns NO map under test, so the only
      // thing that can let them see either map is the global admin override.
      mkChar(SUPERADMIN_ID, 'Super Admin', {
        authzLevel: 'admin',
        corporationId: CORP_ADMIN,
      }),
      mkChar(PLAIN_ID, 'Plain Member', { authzLevel: 'member', corporationId: CORP_OWN }),
    ]);

    const inserted = await db
      .insert(apMap)
      .values([
        { name: 'Own Corp Map', scope: 'wh', type: 'corp', ownerCorporationId: CORP_OWN },
        { name: 'Foreign Corp Map', scope: 'wh', type: 'corp', ownerCorporationId: CORP_FOREIGN },
      ])
      .returning({ id: apMap.id, name: apMap.name });
    ownCorpMapId = inserted.find((m) => m.name === 'Own Corp Map')!.id;
    foreignCorpMapId = inserted.find((m) => m.name === 'Foreign Corp Map')!.id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  // ─── adminVisibilityScope: the level → scope derivation ────────────────────

  it('a director-derived manager resolves to a corp scope, never global', async () => {
    const scope = await adminVisibilityScope(asSession(MANAGER_ID));
    expect(scope).toEqual<AdminVisibilityScope>({
      kind: 'corp',
      corporationId: CORP_OWN,
      allianceId: ALLIANCE_OWN,
    });
  });

  it('an explicit admin resolves to the global scope', async () => {
    expect(await adminVisibilityScope(asSession(SUPERADMIN_ID))).toEqual<AdminVisibilityScope>({
      kind: 'global',
    });
  });

  it('a plain member gets no admin scope (panel redirects)', async () => {
    expect(await adminVisibilityScope(asSession(PLAIN_ID))).toBeNull();
  });

  // ─── mapScopeFilterFor: the headline — manager cannot list foreign maps ────

  it('mapScopeFilterFor confines a manager to their own corp maps', async () => {
    const scope = await adminVisibilityScope(asSession(MANAGER_ID));
    const visible = await mapsVisibleUnder(scope!);
    expect(visible).toContain(ownCorpMapId);
    expect(visible).not.toContain(foreignCorpMapId);
  });

  it('the global scope applies no map filter (admin sees both)', async () => {
    expect(mapScopeFilterFor({ kind: 'global' })).toBeUndefined();
    const visible = await mapsVisibleUnder({ kind: 'global' });
    expect(visible).toContain(ownCorpMapId);
    expect(visible).toContain(foreignCorpMapId);
  });

  // ─── characterScopeFilterFor: members list is corp-scoped too ──────────────

  it('characterScopeFilterFor confines a manager to their own corp members', async () => {
    const scope = await adminVisibilityScope(asSession(MANAGER_ID));
    const rows = await db
      .select({ id: apCharacter.id })
      .from(apCharacter)
      .where(and(inArray(apCharacter.id, characterIds), characterScopeFilterFor(scope!)));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(MANAGER_ID);
    expect(ids).toContain(PLAIN_ID); // same corp
    expect(ids).not.toContain(SUPERADMIN_ID); // foreign corp
  });

  // ─── canViewMap: no global override for a manager ──────────────────────────

  it('a manager can view their own corp map but NOT a foreign corp map', async () => {
    expect(await canViewMap(MANAGER_ID, ownCorpMapId)).toBe(true);
    // The headline regression guard: pre-overhaul this returned true because a
    // Director was a global admin. It must now be false.
    expect(await canViewMap(MANAGER_ID, foreignCorpMapId)).toBe(false);
  });

  it('an explicit admin views every corp map via the global override', async () => {
    expect(await canViewMap(SUPERADMIN_ID, ownCorpMapId)).toBe(true);
    expect(await canViewMap(SUPERADMIN_ID, foreignCorpMapId)).toBe(true);
  });
});

// ─── helpers ───────────────────────────────────────────────────────────────

interface CharOverrides {
  authzLevel?: 'member' | 'manager' | 'admin';
  corporationId?: bigint;
  allianceId?: bigint;
}

function mkChar(id: bigint, name: string, overrides: CharOverrides = {}) {
  return {
    id,
    userId,
    name,
    ownerHash: `hash-${id.toString()}`,
    authzLevel: overrides.authzLevel ?? 'member',
    corporationId: overrides.corporationId ?? null,
    allianceId: overrides.allianceId ?? null,
    status: 'active' as const,
  } as const;
}

function asSession(characterId: bigint): Session {
  return { characterId: characterId.toString(), userId: 0 } as never;
}

async function mapsVisibleUnder(scope: AdminVisibilityScope): Promise<bigint[]> {
  const rows = await db
    .select({ id: apMap.id })
    .from(apMap)
    .where(
      and(
        inArray(apMap.id, [ownCorpMapId, foreignCorpMapId]),
        isNull(apMap.deletedAt),
        mapScopeFilterFor(scope),
      ),
    );
  return rows.map((r) => r.id);
}

async function cleanup() {
  await db.delete(apMap).where(inArray(apMap.id, [ownCorpMapId, foreignCorpMapId].filter((x) => x !== 0n)));
  await db.delete(apCharacter).where(inArray(apCharacter.id, characterIds));
  await db.delete(apCorporation).where(inArray(apCorporation.id, corpIds));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
  ownCorpMapId = 0n;
  foreignCorpMapId = 0n;
}
