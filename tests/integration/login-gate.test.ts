// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import { apAccessGrant, apCharacter, apInstance, apInstanceOwner } from '@/db/schema';
import { isLoginAllowed } from '@/lib/auth/loginGate';

/**
 * Login-gate acceptance gate.
 *
 * Drives `isLoginAllowed` directly against real Postgres — the gate is DB-only
 * (the Auth.js callback resolves corp/alliance via ESI and passes them in), so
 * no ESI mocking is needed; passing `null` corp/alliance exercises the
 * ESI-degrade path. Ids use a 99030xxx block disjoint from the authz-resolution test.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test login-gate
 */
const run = process.env.RUN_DB_TESTS === '1';

// Characters.
const UNKNOWN_CHAR = 99030001n;
const OWNER_MEMBER_CHAR = 99030002n;
const CHAR_LOGIN = 99030003n;
const CORP_MEMBER_CHAR = 99030004n;
const ALLIANCE_MEMBER_CHAR = 99030005n;
const EXPIRED_CHAR = 99030006n;
const BOOT_CHAR_1 = 99030010n;
const BOOT_CHAR_2 = 99030011n;

// Organisations.
const UNKNOWN_CORP = 99039001n;
const OWNER_CORP = 99039002n;
const OWNER_ALLIANCE = 99039003n;
const GRANTED_CORP = 99039004n;
const GRANTED_ALLIANCE = 99039005n;

const charIds = [
  UNKNOWN_CHAR,
  OWNER_MEMBER_CHAR,
  CHAR_LOGIN,
  CORP_MEMBER_CHAR,
  ALLIANCE_MEMBER_CHAR,
  EXPIRED_CHAR,
  BOOT_CHAR_1,
  BOOT_CHAR_2,
];
const orgIds = [UNKNOWN_CORP, OWNER_CORP, OWNER_ALLIANCE, GRANTED_CORP, GRANTED_ALLIANCE];

async function setMode(mode: 'open' | 'restricted') {
  await db
    .insert(apInstance)
    .values({ id: 1, accessMode: mode })
    .onConflictDoUpdate({ target: apInstance.id, set: { accessMode: mode, updatedAt: new Date() } });
}

describe.skipIf(!run)('Stage 3 — login gate (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('access_mode = open', () => {
    beforeAll(async () => {
      await cleanup();
      await setMode('open');
    });

    it('admits any character regardless of allowlist', async () => {
      expect(
        await isLoginAllowed({
          characterId: UNKNOWN_CHAR,
          corporationId: UNKNOWN_CORP,
          allianceId: null,
        }),
      ).toBe(true);
    });
  });

  describe('access_mode = restricted (configured instance — owner seeded)', () => {
    beforeAll(async () => {
      await cleanup();
      await setMode('restricted');
      // An owner makes the instance "configured" → bootstrap is off for this block.
      await db.insert(apInstanceOwner).values([
        { principalKind: 'corporation', principalId: OWNER_CORP },
        { principalKind: 'alliance', principalId: OWNER_ALLIANCE },
      ]);
      await db.insert(apAccessGrant).values([
        loginGrant('character', CHAR_LOGIN),
        loginGrant('corporation', GRANTED_CORP),
        loginGrant('alliance', GRANTED_ALLIANCE),
        // Expired an hour ago → ignored.
        loginGrant('character', EXPIRED_CHAR, new Date(Date.now() - 60 * 60 * 1000)),
      ]);
    });

    afterAll(cleanup);

    it('denies a non-owner, non-listed character', async () => {
      expect(
        await isLoginAllowed({
          characterId: UNKNOWN_CHAR,
          corporationId: UNKNOWN_CORP,
          allianceId: null,
        }),
      ).toBe(false);
    });

    it('admits a member of an owner corporation', async () => {
      expect(
        await isLoginAllowed({
          characterId: OWNER_MEMBER_CHAR,
          corporationId: OWNER_CORP,
          allianceId: null,
        }),
      ).toBe(true);
    });

    it('admits a member of an owner alliance', async () => {
      expect(
        await isLoginAllowed({
          characterId: OWNER_MEMBER_CHAR,
          corporationId: UNKNOWN_CORP,
          allianceId: OWNER_ALLIANCE,
        }),
      ).toBe(true);
    });

    it('admits a character with a direct login grant', async () => {
      expect(
        await isLoginAllowed({
          characterId: CHAR_LOGIN,
          corporationId: UNKNOWN_CORP,
          allianceId: null,
        }),
      ).toBe(true);
    });

    it('admits a character via a corp-level login grant', async () => {
      expect(
        await isLoginAllowed({
          characterId: CORP_MEMBER_CHAR,
          corporationId: GRANTED_CORP,
          allianceId: null,
        }),
      ).toBe(true);
    });

    it('admits a character via an alliance-level login grant', async () => {
      expect(
        await isLoginAllowed({
          characterId: ALLIANCE_MEMBER_CHAR,
          corporationId: UNKNOWN_CORP,
          allianceId: GRANTED_ALLIANCE,
        }),
      ).toBe(true);
    });

    it('ignores an expired login grant', async () => {
      expect(
        await isLoginAllowed({
          characterId: EXPIRED_CHAR,
          corporationId: UNKNOWN_CORP,
          allianceId: null,
        }),
      ).toBe(false);
    });

    it('ESI-degrade: an owner-only member is denied when affiliation is unknown', async () => {
      // corp/alliance null (ESI fetch failed) → the owner check can't confirm.
      expect(
        await isLoginAllowed({
          characterId: OWNER_MEMBER_CHAR,
          corporationId: null,
          allianceId: null,
        }),
      ).toBe(false);
    });

    it('ESI-degrade: a direct character grant still admits when affiliation is unknown', async () => {
      expect(
        await isLoginAllowed({
          characterId: CHAR_LOGIN,
          corporationId: null,
          allianceId: null,
        }),
      ).toBe(true);
    });
  });

  describe('access_mode = restricted (unconfigured instance — bootstrap)', () => {
    // Bootstrap requires a *completely* unconfigured instance. On a shared dev
    // DB that means temporarily clearing owners + instance grants AND demoting
    // any existing `admin` characters, all restored in afterAll.
    let demotedAdminIds: bigint[] = [];

    beforeAll(async () => {
      await cleanup();
      await setMode('restricted');
      await db.delete(apInstanceOwner);
      await db.delete(apAccessGrant).where(eq(apAccessGrant.scope, 'instance'));
      const admins = await db
        .select({ id: apCharacter.id })
        .from(apCharacter)
        .where(eq(apCharacter.authzLevel, 'admin'));
      demotedAdminIds = admins.map((r) => r.id);
      if (demotedAdminIds.length > 0) {
        await db
          .update(apCharacter)
          .set({ authzLevel: 'member' })
          .where(inArray(apCharacter.id, demotedAdminIds));
      }
    });

    afterAll(async () => {
      if (demotedAdminIds.length > 0) {
        await db
          .update(apCharacter)
          .set({ authzLevel: 'admin' })
          .where(inArray(apCharacter.id, demotedAdminIds));
      }
      await cleanup();
    });

    it('admits the first character and records a bootstrap admin grant; denies the next', async () => {
      expect(
        await isLoginAllowed({ characterId: BOOT_CHAR_1, corporationId: null, allianceId: null }),
      ).toBe(true);

      const grants = await db
        .select({ capability: apAccessGrant.capability, note: apAccessGrant.note })
        .from(apAccessGrant)
        .where(
          and(
            eq(apAccessGrant.principalKind, 'character'),
            eq(apAccessGrant.principalId, BOOT_CHAR_1),
            eq(apAccessGrant.scope, 'instance'),
          ),
        );
      expect(grants).toHaveLength(1);
      expect(grants[0]).toMatchObject({ capability: 'admin', note: 'bootstrap' });

      // The instance is now configured → a second unknown character is denied.
      expect(
        await isLoginAllowed({ characterId: BOOT_CHAR_2, corporationId: null, allianceId: null }),
      ).toBe(false);
    });
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function loginGrant(
  principalKind: 'character' | 'corporation' | 'alliance',
  principalId: bigint,
  expiresAt: Date | null = null,
) {
  return {
    principalKind,
    principalId,
    scope: 'instance' as const,
    mapId: null,
    capability: 'login' as const,
    expiresAt,
  };
}

async function cleanup() {
  await db
    .delete(apAccessGrant)
    .where(inArray(apAccessGrant.principalId, [...charIds, ...orgIds]));
  await db.delete(apInstanceOwner).where(inArray(apInstanceOwner.principalId, orgIds));
}
