// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { db, pool } from '@/db/client';
import { apCharacter, apCorporation, apInstance, apUser } from '@/db/schema';

/**
 * Admin instance settings (real Postgres), post Stage-4 teardown.
 *
 * The corp-rights matrix is gone; the only surviving `/admin/settings` action is
 * `adminSetStaleSignatureThreshold`. Drives it end-to-end and asserts:
 *   - admin sets the instance-wide threshold on `ap_instance`;
 *   - validation rejects out-of-range minutes;
 *   - a corp Director, a plain member, and an unauthenticated session are all
 *     denied (global-admin-only).
 *
 * Snapshots and restores the `ap_instance` singleton (DB tests hit the live dev
 * DB).
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test admin-settings
 */
const run = process.env.RUN_DB_TESTS === '1';

let currentSession: Session | null = null;
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => currentSession) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { adminSetStaleSignatureThreshold } = await import('@/app/(admin)/actions/settings');

const CORP_A = 96005011n;

const ADMIN_ID = 96005001n;
const DIRECTOR_ID = 96005002n; // corp Director (member authz) — must be denied
const MEMBER_A_ID = 96005004n;

let userId = 0;
let instanceSnapshot: { minutes: number } | null = null;

const characterIds = [ADMIN_ID, DIRECTOR_ID, MEMBER_A_ID];

function asSession(characterId: bigint): Session {
  return { characterId: characterId.toString(), user: { id: '0' } } as unknown as Session;
}

async function readThreshold(): Promise<number | undefined> {
  const [row] = await db
    .select({ minutes: apInstance.staleSignatureThresholdMinutes })
    .from(apInstance)
    .where(eq(apInstance.id, 1));
  return row?.minutes;
}

describe.skipIf(!run)('admin instance settings (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;

    await db.insert(apCorporation).values([{ id: CORP_A, name: 'Settings Test Corp A' }]);

    await db.insert(apCharacter).values([
      {
        id: ADMIN_ID,
        userId,
        name: 'Settings Admin',
        ownerHash: `hash-${ADMIN_ID.toString()}`,
        authzLevel: 'admin',
        corporationId: CORP_A,
      },
      {
        id: DIRECTOR_ID,
        userId,
        name: 'Settings Director',
        ownerHash: `hash-${DIRECTOR_ID.toString()}`,
        isDirector: true,
        corporationId: CORP_A,
      },
      {
        id: MEMBER_A_ID,
        userId,
        name: 'Settings Member A',
        ownerHash: `hash-${MEMBER_A_ID.toString()}`,
        corporationId: CORP_A,
      },
    ]);

    // Snapshot the singleton (or note it's absent), ensuring a row exists to edit.
    const [existing] = await db
      .select({ minutes: apInstance.staleSignatureThresholdMinutes })
      .from(apInstance)
      .where(eq(apInstance.id, 1));
    instanceSnapshot = existing ?? null;
    await db.insert(apInstance).values({ id: 1 }).onConflictDoNothing();
  });

  afterAll(async () => {
    if (instanceSnapshot !== null) {
      await db
        .update(apInstance)
        .set({ staleSignatureThresholdMinutes: instanceSnapshot.minutes })
        .where(eq(apInstance.id, 1));
    } else {
      await db.delete(apInstance).where(eq(apInstance.id, 1));
    }
    await cleanup();
    await pool.end();
  });

  beforeEach(() => {
    currentSession = null;
  });

  it('admin sets the instance-wide stale threshold', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminSetStaleSignatureThreshold({ minutes: 123 });
    expect(result.ok).toBe(true);
    expect(await readThreshold()).toBe(123);
  });

  it('rejects a threshold below the minimum', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminSetStaleSignatureThreshold({ minutes: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects a threshold above one week', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminSetStaleSignatureThreshold({ minutes: 7 * 24 * 60 + 1 });
    expect(result.ok).toBe(false);
  });

  it('a corp Director is denied (global-admin-only)', async () => {
    currentSession = asSession(DIRECTOR_ID);
    expect((await adminSetStaleSignatureThreshold({ minutes: 99 })).ok).toBe(false);
  });

  it('a plain member is denied', async () => {
    currentSession = asSession(MEMBER_A_ID);
    expect((await adminSetStaleSignatureThreshold({ minutes: 99 })).ok).toBe(false);
  });

  it('an unauthenticated session is denied', async () => {
    currentSession = null;
    expect((await adminSetStaleSignatureThreshold({ minutes: 99 })).ok).toBe(false);
  });
});

async function cleanup() {
  await db.delete(apCharacter).where(inArray(apCharacter.id, characterIds));
  await db.delete(apCorporation).where(inArray(apCorporation.id, [CORP_A]));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
}
