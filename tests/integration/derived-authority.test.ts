// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import { apAlliance, apCharacter, apMap, apUser } from '@/db/schema';
import {
  canCreateMap,
  canManageMap,
  executorCorpOf,
} from '@/lib/auth/rights';

/**
 * Derived-authority acceptance gate (permissions multi-tenant, stage 1).
 *
 * Drives the new EVE-state-derived authority functions against real Postgres:
 *   - `executorCorpOf` reads the `ap_alliance` cache.
 *   - `canManageMap` — private owner, corp Director, alliance executor-corp
 *     Director, and every denial in between.
 *   - `canCreateMap` — private/corp/alliance create gates.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

const CORP_EXEC = 99100001n; // executor corp of Alliance X
const CORP_NONEXEC = 99100002n; // ordinary member corp of Alliance X
const CORP_OTHER = 99100003n; // corp in a different alliance

const ALLIANCE_X = 99100901n; // executor = CORP_EXEC
const ALLIANCE_Y = 99100902n; // executor = CORP_OTHER

const UNKNOWN_ALLIANCE = 99100999n; // no ap_alliance row

const ADMIN_ID = 99101001n;
const PRIV_OWNER_ID = 99101002n;
const OTHER_MEMBER_ID = 99101003n;
const EXEC_DIRECTOR_ID = 99101004n;
const EXEC_NONDIRECTOR_ID = 99101005n;
const NONEXEC_DIRECTOR_ID = 99101006n;
const OTHER_DIRECTOR_ID = 99101007n;
const KICKED_DIRECTOR_ID = 99101008n;

let userId = 0;
let privateMapId = 0n;
let corpMapId = 0n;
let allianceMapId = 0n;

const characterIds = [
  ADMIN_ID,
  PRIV_OWNER_ID,
  OTHER_MEMBER_ID,
  EXEC_DIRECTOR_ID,
  EXEC_NONDIRECTOR_ID,
  NONEXEC_DIRECTOR_ID,
  OTHER_DIRECTOR_ID,
  KICKED_DIRECTOR_ID,
];

describe.skipIf(!run)('Derived authority — canManageMap / canCreateMap (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;

    // Alliance X is run by CORP_EXEC; Alliance Y by CORP_OTHER.
    await db.insert(apAlliance).values([
      { id: ALLIANCE_X, name: 'Alliance X', executorCorporationId: CORP_EXEC },
      { id: ALLIANCE_Y, name: 'Alliance Y', executorCorporationId: CORP_OTHER },
    ]);

    await db.insert(apCharacter).values([
      mkChar(ADMIN_ID, 'Operator Admin', {
        authzLevel: 'admin',
        corporationId: CORP_OTHER,
        allianceId: ALLIANCE_Y,
      }),
      mkChar(PRIV_OWNER_ID, 'Private Owner', { corporationId: CORP_NONEXEC, allianceId: ALLIANCE_X }),
      mkChar(OTHER_MEMBER_ID, 'Plain Member', { corporationId: CORP_NONEXEC, allianceId: ALLIANCE_X }),
      mkChar(EXEC_DIRECTOR_ID, 'Exec Director', {
        corporationId: CORP_EXEC,
        allianceId: ALLIANCE_X,
        isDirector: true,
      }),
      mkChar(EXEC_NONDIRECTOR_ID, 'Exec Member', { corporationId: CORP_EXEC, allianceId: ALLIANCE_X }),
      mkChar(NONEXEC_DIRECTOR_ID, 'Non-Exec Director', {
        corporationId: CORP_NONEXEC,
        allianceId: ALLIANCE_X,
        isDirector: true,
      }),
      mkChar(OTHER_DIRECTOR_ID, 'Other-Alliance Director', {
        corporationId: CORP_OTHER,
        allianceId: ALLIANCE_Y,
        isDirector: true,
      }),
      mkChar(KICKED_DIRECTOR_ID, 'Kicked Director', {
        corporationId: CORP_EXEC,
        allianceId: ALLIANCE_X,
        isDirector: true,
        status: 'kicked',
        statusExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ]);

    const inserted = await db
      .insert(apMap)
      .values([
        { name: 'DA Private', scope: 'wh', type: 'private', ownerCharacterId: PRIV_OWNER_ID },
        { name: 'DA Corp', scope: 'all', type: 'corp', ownerCorporationId: CORP_EXEC },
        { name: 'DA Alliance', scope: 'all', type: 'alliance', ownerAllianceId: ALLIANCE_X },
      ])
      .returning({ id: apMap.id, name: apMap.name });

    privateMapId = inserted.find((m) => m.name === 'DA Private')!.id;
    corpMapId = inserted.find((m) => m.name === 'DA Corp')!.id;
    allianceMapId = inserted.find((m) => m.name === 'DA Alliance')!.id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  // ─── executorCorpOf ────────────────────────────────────────────────────────

  it('executorCorpOf reads the alliance cache; null when unknown', async () => {
    expect(await executorCorpOf(ALLIANCE_X)).toBe(CORP_EXEC);
    expect(await executorCorpOf(ALLIANCE_Y)).toBe(CORP_OTHER);
    expect(await executorCorpOf(UNKNOWN_ALLIANCE)).toBeNull();
  });

  // ─── canManageMap: private ─────────────────────────────────────────────────

  it('private map — owner and admin manage; nobody else', async () => {
    expect(await canManageMap(PRIV_OWNER_ID, privateMapId)).toBe(true);
    expect(await canManageMap(OTHER_MEMBER_ID, privateMapId)).toBe(false);
    expect(await canManageMap(EXEC_DIRECTOR_ID, privateMapId)).toBe(false);
    expect(await canManageMap(ADMIN_ID, privateMapId)).toBe(true);
  });

  // ─── canManageMap: corp ────────────────────────────────────────────────────

  it('corp map — only a Director of the owning corp (or admin) manages', async () => {
    expect(await canManageMap(EXEC_DIRECTOR_ID, corpMapId)).toBe(true);
    // Member of the owning corp but not a Director.
    expect(await canManageMap(EXEC_NONDIRECTOR_ID, corpMapId)).toBe(false);
    // Director, but of a different corp.
    expect(await canManageMap(NONEXEC_DIRECTOR_ID, corpMapId)).toBe(false);
    expect(await canManageMap(ADMIN_ID, corpMapId)).toBe(true);
  });

  // ─── canManageMap: alliance ────────────────────────────────────────────────

  it('alliance map — only the executor corp Director (or admin) manages', async () => {
    expect(await canManageMap(EXEC_DIRECTOR_ID, allianceMapId)).toBe(true);
    // Director in the owning alliance but NOT in the executor corp.
    expect(await canManageMap(NONEXEC_DIRECTOR_ID, allianceMapId)).toBe(false);
    // Director, but in a different alliance entirely.
    expect(await canManageMap(OTHER_DIRECTOR_ID, allianceMapId)).toBe(false);
    // Executor-corp member who is not a Director.
    expect(await canManageMap(EXEC_NONDIRECTOR_ID, allianceMapId)).toBe(false);
    expect(await canManageMap(ADMIN_ID, allianceMapId)).toBe(true);
  });

  it('a kicked Director manages nothing', async () => {
    expect(await canManageMap(KICKED_DIRECTOR_ID, corpMapId)).toBe(false);
    expect(await canManageMap(KICKED_DIRECTOR_ID, allianceMapId)).toBe(false);
  });

  // ─── canCreateMap ────────────────────────────────────────────────────

  it('private maps are creatable by any active character; kicked denied', async () => {
    expect(await canCreateMap(OTHER_MEMBER_ID, 'private')).toBe(true);
    expect(await canCreateMap(EXEC_DIRECTOR_ID, 'private')).toBe(true);
    expect(await canCreateMap(ADMIN_ID, 'private')).toBe(true);
    expect(await canCreateMap(KICKED_DIRECTOR_ID, 'private')).toBe(false);
  });

  it('corp maps require Director; plain members denied', async () => {
    expect(await canCreateMap(EXEC_DIRECTOR_ID, 'corp')).toBe(true);
    expect(await canCreateMap(NONEXEC_DIRECTOR_ID, 'corp')).toBe(true);
    expect(await canCreateMap(OTHER_MEMBER_ID, 'corp')).toBe(false);
    expect(await canCreateMap(ADMIN_ID, 'corp')).toBe(true);
  });

  it('alliance maps require a Director in the executor corp', async () => {
    expect(await canCreateMap(EXEC_DIRECTOR_ID, 'alliance')).toBe(true);
    // Director in the alliance but not its executor corp.
    expect(await canCreateMap(NONEXEC_DIRECTOR_ID, 'alliance')).toBe(false);
    // Director who is the executor of their own alliance (Y).
    expect(await canCreateMap(OTHER_DIRECTOR_ID, 'alliance')).toBe(true);
    expect(await canCreateMap(OTHER_MEMBER_ID, 'alliance')).toBe(false);
    expect(await canCreateMap(ADMIN_ID, 'alliance')).toBe(true);
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────────

interface CharOverrides {
  authzLevel?: 'member' | 'admin';
  corporationId?: bigint;
  allianceId?: bigint;
  isDirector?: boolean;
  status?: 'active' | 'kicked' | 'banned';
  statusExpiresAt?: Date;
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
    status: overrides.status ?? 'active',
    statusExpiresAt: overrides.statusExpiresAt ?? null,
  } as const;
}

async function cleanup() {
  await db
    .delete(apMap)
    .where(sql`name IN ('DA Private', 'DA Corp', 'DA Alliance')`);
  await db.delete(apCharacter).where(inArray(apCharacter.id, characterIds));
  await db.delete(apAlliance).where(inArray(apAlliance.id, [ALLIANCE_X, ALLIANCE_Y]));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
  privateMapId = 0n;
  corpMapId = 0n;
  allianceMapId = 0n;
}
