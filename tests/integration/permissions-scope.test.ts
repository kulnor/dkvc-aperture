// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import { apCharacter, apCorporation, apMap, apUser } from '@/db/schema';
import {
  adminVisibilityScope,
  canManageMap,
  canViewMap,
  type AdminVisibilityScope,
  type Session,
} from '@/lib/auth/rights';

/**
 * Admin-scope + Director-authority acceptance gate (post Stage-4 teardown).
 *
 * The headline rules:
 *   - The `/admin` operator console is global-admin-only. `adminVisibilityScope`
 *     returns `{ kind: 'global' }` for an explicit `admin` and `null` for
 *     everyone else — including corp Directors. There is no corp scope.
 *   - A corp Director is NOT a global admin. Their authority is map-level: they
 *     manage their own corp's maps (`canManageMap`) and view them as any corp
 *     member would, but have no reach into a foreign corp's maps and no admin
 *     panel.
 *
 * Drives the `rights.ts` primitives directly against real Postgres (no
 * resolver/ESI — `authz_level` + `is_director` are seeded as the cache the
 * resolver would have written).
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

const DIRECTOR_ID = 99050001n; // corp Director (member authz), corp OWN
const SUPERADMIN_ID = 99050002n; // explicit admin grant, in an unrelated corp
const PLAIN_ID = 99050003n; // plain member, corp OWN

let userId = 0;
let ownCorpMapId = 0n;
let foreignCorpMapId = 0n;

const characterIds = [DIRECTOR_ID, SUPERADMIN_ID, PLAIN_ID];
const corpIds = [CORP_OWN, CORP_FOREIGN, CORP_ADMIN];

describe.skipIf(!run)('Admin scope + Director authority (real Postgres)', () => {
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
      mkChar(DIRECTOR_ID, 'Corp Director', {
        corporationId: CORP_OWN,
        allianceId: ALLIANCE_OWN,
        isDirector: true,
      }),
      // The super-admin sits in a corp that owns NO map under test, so the only
      // thing that can let them see either map is the global admin override.
      mkChar(SUPERADMIN_ID, 'Super Admin', {
        authzLevel: 'admin',
        corporationId: CORP_ADMIN,
      }),
      mkChar(PLAIN_ID, 'Plain Member', { corporationId: CORP_OWN }),
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

  // ─── adminVisibilityScope: global-admin-only ───────────────────────────────

  it('an explicit admin resolves to the global scope', async () => {
    expect(await adminVisibilityScope(asSession(SUPERADMIN_ID))).toEqual<AdminVisibilityScope>({
      kind: 'global',
    });
  });

  it('a corp Director gets NO admin scope (not a global operator)', async () => {
    expect(await adminVisibilityScope(asSession(DIRECTOR_ID))).toBeNull();
  });

  it('a plain member gets no admin scope (panel redirects)', async () => {
    expect(await adminVisibilityScope(asSession(PLAIN_ID))).toBeNull();
  });

  // ─── Director map authority: own corp only ─────────────────────────────────

  it('a Director manages their own corp map but NOT a foreign corp map', async () => {
    expect(await canManageMap(DIRECTOR_ID, ownCorpMapId)).toBe(true);
    expect(await canManageMap(DIRECTOR_ID, foreignCorpMapId)).toBe(false);
  });

  it('a plain member can view but not manage their corp map', async () => {
    expect(await canViewMap(PLAIN_ID, ownCorpMapId)).toBe(true);
    expect(await canManageMap(PLAIN_ID, ownCorpMapId)).toBe(false);
  });

  it('a Director can view their own corp map but NOT a foreign corp map', async () => {
    expect(await canViewMap(DIRECTOR_ID, ownCorpMapId)).toBe(true);
    expect(await canViewMap(DIRECTOR_ID, foreignCorpMapId)).toBe(false);
  });

  // ─── admin global override ─────────────────────────────────────────────────

  it('an explicit admin views and manages every corp map via the global override', async () => {
    expect(await canViewMap(SUPERADMIN_ID, ownCorpMapId)).toBe(true);
    expect(await canViewMap(SUPERADMIN_ID, foreignCorpMapId)).toBe(true);
    expect(await canManageMap(SUPERADMIN_ID, ownCorpMapId)).toBe(true);
    expect(await canManageMap(SUPERADMIN_ID, foreignCorpMapId)).toBe(true);
  });
});

// ─── helpers ───────────────────────────────────────────────────────────────

interface CharOverrides {
  authzLevel?: 'member' | 'admin';
  corporationId?: bigint;
  allianceId?: bigint;
  isDirector?: boolean;
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
    isDirector: overrides.isDirector ?? false,
    status: 'active' as const,
  } as const;
}

function asSession(characterId: bigint): Session {
  return { characterId: characterId.toString(), userId: 0 } as never;
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
