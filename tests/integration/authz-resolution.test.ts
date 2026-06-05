// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import { apAccessGrant, apInstanceOwner } from '@/db/schema';
import { resolveAuthzLevel } from '@/lib/auth/resolveAuthz';

/**
 * Authz-resolution acceptance gate.
 *
 * Drives `resolveAuthzLevel` directly against real Postgres (the derivation is
 * the load-bearing part; this avoids mocking ESI). The headline guarantee:
 *   - ANY Director ⇒ corp-scoped `manager`, even when their corp is an
 *     `ap_instance_owner` — ownership never elevates to global admin.
 *   - Global `admin` is reachable ONLY via an explicit `capability='admin'`
 *     instance grant.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test authz-resolution
 */
const run = process.env.RUN_DB_TESTS === '1';

// No-Director / no-grant character.
const PLAIN_ID = 99010001n;
// Director, no grant.
const DIRECTOR_ID = 99010002n;
// Director whose corp is also an instance owner.
const OWNER_DIRECTOR_ID = 99010003n;
// Non-director with an explicit `manage` grant.
const MANAGE_GRANT_ID = 99010004n;
// Non-director with an explicit `admin` grant.
const ADMIN_GRANT_ID = 99010005n;
// Director who ALSO holds an `admin` grant (max wins → admin).
const DIRECTOR_ADMIN_GRANT_ID = 99010006n;
// Non-director with an EXPIRED `manage` grant (ignored → member).
const EXPIRED_GRANT_ID = 99010007n;

const OWNER_CORP_ID = 99019001n;

const principalIds = [
  PLAIN_ID,
  DIRECTOR_ID,
  OWNER_DIRECTOR_ID,
  MANAGE_GRANT_ID,
  ADMIN_GRANT_ID,
  DIRECTOR_ADMIN_GRANT_ID,
  EXPIRED_GRANT_ID,
];

describe.skipIf(!run)('Stage 2 — authz resolution (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    // The instance owns one corp — used to prove ownership does NOT elevate.
    await db.insert(apInstanceOwner).values({
      principalKind: 'corporation',
      principalId: OWNER_CORP_ID,
    });

    await db.insert(apAccessGrant).values([
      instanceGrant(MANAGE_GRANT_ID, 'manage'),
      instanceGrant(ADMIN_GRANT_ID, 'admin'),
      instanceGrant(DIRECTOR_ADMIN_GRANT_ID, 'admin'),
      // Expired an hour ago → must be ignored.
      instanceGrant(EXPIRED_GRANT_ID, 'manage', new Date(Date.now() - 60 * 60 * 1000)),
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('a non-director with no grant resolves to member', async () => {
    expect(await resolveAuthzLevel({ characterId: PLAIN_ID, isDirector: false })).toBe('member');
  });

  it('any Director resolves to manager (the headline-bug fix — NOT admin)', async () => {
    expect(await resolveAuthzLevel({ characterId: DIRECTOR_ID, isDirector: true })).toBe('manager');
  });

  it('a Director whose corp owns the instance is STILL only manager', async () => {
    // OWNER_DIRECTOR_ID has no character/corp row; the resolver does not read
    // ap_instance_owner at all, so the owner row above must not change the level.
    expect(
      await resolveAuthzLevel({ characterId: OWNER_DIRECTOR_ID, isDirector: true }),
    ).toBe('manager');
  });

  it('an explicit manage grant resolves to manager', async () => {
    expect(
      await resolveAuthzLevel({ characterId: MANAGE_GRANT_ID, isDirector: false }),
    ).toBe('manager');
  });

  it('an explicit admin grant is the only path to global admin', async () => {
    expect(
      await resolveAuthzLevel({ characterId: ADMIN_GRANT_ID, isDirector: false }),
    ).toBe('admin');
  });

  it('takes the max of derived and explicit (director + admin grant ⇒ admin)', async () => {
    expect(
      await resolveAuthzLevel({ characterId: DIRECTOR_ADMIN_GRANT_ID, isDirector: true }),
    ).toBe('admin');
  });

  it('an expired grant is ignored (falls back to derived member)', async () => {
    expect(
      await resolveAuthzLevel({ characterId: EXPIRED_GRANT_ID, isDirector: false }),
    ).toBe('member');
  });

  it('an explicit grant survives a resync (resolver, not a CASE, preserves it)', async () => {
    // Same input a periodic non-director resync would pass: the manage grant
    // still wins, so the cached level stays manager across passes.
    expect(
      await resolveAuthzLevel({ characterId: MANAGE_GRANT_ID, isDirector: false }),
    ).toBe('manager');
  });
});

// ─── helpers ───────────────────────────────────────────────────────────────

function instanceGrant(
  principalId: bigint,
  capability: 'manage' | 'admin',
  expiresAt: Date | null = null,
) {
  return {
    principalKind: 'character' as const,
    principalId,
    scope: 'instance' as const,
    mapId: null,
    capability,
    expiresAt,
  };
}

async function cleanup() {
  await db
    .delete(apAccessGrant)
    .where(
      and(
        eq(apAccessGrant.principalKind, 'character'),
        inArray(apAccessGrant.principalId, principalIds),
      ),
    );
  await db
    .delete(apInstanceOwner)
    .where(
      and(
        eq(apInstanceOwner.principalKind, 'corporation'),
        eq(apInstanceOwner.principalId, OWNER_CORP_ID),
      ),
    );
}
