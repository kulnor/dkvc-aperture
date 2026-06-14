// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import { apAccessGrant, apInstanceOwner } from '@/db/schema';
import { resolveAuthzLevel } from '@/lib/auth/resolveAuthz';

/**
 * Authz-resolution acceptance gate (post Stage-4 teardown).
 *
 * Drives `resolveAuthzLevel` directly against real Postgres. `authz_level` is
 * now `member | admin` only. The headline guarantee:
 *   - Global `admin` is reachable ONLY via an explicit, unexpired
 *     `capability='admin'` instance grant.
 *   - Nothing else derives admin — not the Director role, not instance
 *     ownership. (Corp/alliance map authority is the separate `is_director` bit,
 *     not resolved here.)
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test authz-resolution
 */
const run = process.env.RUN_DB_TESTS === '1';

// No grant — plain member.
const PLAIN_ID = 99010001n;
// Non-grant character whose corp is an instance owner (ownership must NOT elevate).
const OWNER_MEMBER_ID = 99010003n;
// Explicit `admin` grant.
const ADMIN_GRANT_ID = 99010005n;
// EXPIRED `admin` grant (ignored → member).
const EXPIRED_GRANT_ID = 99010007n;

const OWNER_CORP_ID = 99019001n;

const principalIds = [PLAIN_ID, OWNER_MEMBER_ID, ADMIN_GRANT_ID, EXPIRED_GRANT_ID];

describe.skipIf(!run)('authz resolution (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    // The instance owns one corp — used to prove ownership does NOT elevate.
    await db.insert(apInstanceOwner).values({
      principalKind: 'corporation',
      principalId: OWNER_CORP_ID,
    });

    await db.insert(apAccessGrant).values([
      instanceAdminGrant(ADMIN_GRANT_ID),
      // Expired an hour ago → must be ignored.
      instanceAdminGrant(EXPIRED_GRANT_ID, new Date(Date.now() - 60 * 60 * 1000)),
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('a character with no grant resolves to member', async () => {
    expect(await resolveAuthzLevel(PLAIN_ID)).toBe('member');
  });

  it('instance ownership does not elevate (still member without an admin grant)', async () => {
    // The resolver does not read ap_instance_owner at all, so the owner row
    // above must not change the level.
    expect(await resolveAuthzLevel(OWNER_MEMBER_ID)).toBe('member');
  });

  it('an explicit admin grant is the only path to global admin', async () => {
    expect(await resolveAuthzLevel(ADMIN_GRANT_ID)).toBe('admin');
  });

  it('an expired admin grant is ignored (falls back to member)', async () => {
    expect(await resolveAuthzLevel(EXPIRED_GRANT_ID)).toBe('member');
  });

  it('an explicit grant survives a resync (resolver re-reads it each pass)', async () => {
    expect(await resolveAuthzLevel(ADMIN_GRANT_ID)).toBe('admin');
  });
});

// ─── helpers ───────────────────────────────────────────────────────────────

function instanceAdminGrant(principalId: bigint, expiresAt: Date | null = null) {
  return {
    principalKind: 'character' as const,
    principalId,
    scope: 'instance' as const,
    mapId: null,
    capability: 'admin' as const,
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
