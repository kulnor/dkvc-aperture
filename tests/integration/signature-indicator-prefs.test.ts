// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { db, pool } from '@/db/client';
import { apCharacter, apInstance, apUser } from '@/db/schema';

/**
 * Stale/unscanned signature indicators — settings pipeline (real Postgres).
 *
 * Drives the two write paths and the resolver end-to-end:
 *   - admin sets the global default (`ap_instance`); a member is denied;
 *   - a user override ≤ global is accepted and resolved back;
 *   - an override > global is rejected and the row is left untouched;
 *   - a null override clears back to the global default;
 *   - `getSignatureIndicatorPrefs` defensively caps a stale (too-large) row.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

let currentSession: Session | null = null;
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => currentSession) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { adminSetStaleSignatureThreshold } = await import('@/app/(admin)/actions/settings');
const { setSignatureIndicatorPrefsAction } = await import('@/app/(app)/actions/account');
const { getSignatureIndicatorPrefs, getGlobalStaleThresholdMinutes } = await import(
  '@/lib/session'
);

const ADMIN_ID = 96009001n;
const MEMBER_ID = 96009002n;
const characterIds = [ADMIN_ID, MEMBER_ID];

const GLOBAL = 240; // 4h, set for the test
let userId = 0;
let savedThreshold = 240;

function asSession(characterId: bigint): Session {
  return {
    characterId: characterId.toString(),
    userId,
    user: { id: String(userId) },
  } as unknown as Session;
}

describe.skipIf(!run)('signature-indicator settings pipeline (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    // Snapshot the real singleton threshold so we restore it afterwards.
    const [inst] = await db
      .select({ minutes: apInstance.staleSignatureThresholdMinutes })
      .from(apInstance)
      .where(eq(apInstance.id, 1));
    savedThreshold = inst?.minutes ?? 240;
    await db
      .update(apInstance)
      .set({ staleSignatureThresholdMinutes: GLOBAL })
      .where(eq(apInstance.id, 1));

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;

    await db.insert(apCharacter).values([
      {
        id: ADMIN_ID,
        userId,
        name: 'SigInd Admin',
        ownerHash: `hash-${ADMIN_ID.toString()}`,
        authzLevel: 'admin',
      },
      {
        id: MEMBER_ID,
        userId,
        name: 'SigInd Member',
        ownerHash: `hash-${MEMBER_ID.toString()}`,
      },
    ]);
  });

  afterAll(async () => {
    await db
      .update(apInstance)
      .set({ staleSignatureThresholdMinutes: savedThreshold })
      .where(eq(apInstance.id, 1));
    await cleanup();
    await pool.end();
  });

  beforeEach(async () => {
    currentSession = null;
    // Reset the user's override + toggles to defaults between cases.
    await db
      .update(apUser)
      .set({
        staleSignatureThresholdMinutes: null,
        showStaleSignatureIndicator: true,
        showUnscannedSignatureIndicator: true,
      })
      .where(eq(apUser.id, userId));
  });

  // ─── admin global default ───────────────────────────────────────────────

  it('admin can set the global default; a member cannot', async () => {
    currentSession = asSession(MEMBER_ID);
    const denied = await adminSetStaleSignatureThreshold({ minutes: 120 });
    expect(denied.ok).toBe(false);
    expect(await getGlobalStaleThresholdMinutes()).toBe(GLOBAL);

    currentSession = asSession(ADMIN_ID);
    const ok = await adminSetStaleSignatureThreshold({ minutes: 180 });
    expect(ok.ok).toBe(true);
    expect(await getGlobalStaleThresholdMinutes()).toBe(180);

    // Restore for the remaining cases.
    await adminSetStaleSignatureThreshold({ minutes: GLOBAL });
  });

  it('admin global default rejects out-of-range values', async () => {
    currentSession = asSession(ADMIN_ID);
    expect((await adminSetStaleSignatureThreshold({ minutes: 0 })).ok).toBe(false);
    expect(
      (await adminSetStaleSignatureThreshold({ minutes: 7 * 24 * 60 + 1 })).ok,
    ).toBe(false);
  });

  // ─── per-user override cap ──────────────────────────────────────────────

  it('accepts an override at or below the global default and resolves it back', async () => {
    currentSession = asSession(MEMBER_ID);
    const res = await setSignatureIndicatorPrefsAction({
      thresholdMinutes: 120,
      showStale: true,
      showUnscanned: false,
    });
    expect(res.ok).toBe(true);

    const prefs = await getSignatureIndicatorPrefs(userId);
    expect(prefs).toEqual({ thresholdMinutes: 120, showStale: true, showUnscanned: false });
  });

  it('rejects an override larger than the global default and leaves the row untouched', async () => {
    currentSession = asSession(MEMBER_ID);
    const res = await setSignatureIndicatorPrefsAction({
      thresholdMinutes: GLOBAL + 60,
      showStale: true,
      showUnscanned: true,
    });
    expect(res.ok).toBe(false);

    const [row] = await db
      .select({ override: apUser.staleSignatureThresholdMinutes })
      .from(apUser)
      .where(eq(apUser.id, userId));
    expect(row?.override).toBeNull();
  });

  it('a null override falls back to the global default', async () => {
    currentSession = asSession(MEMBER_ID);
    await setSignatureIndicatorPrefsAction({
      thresholdMinutes: null,
      showStale: false,
      showUnscanned: true,
    });
    const prefs = await getSignatureIndicatorPrefs(userId);
    expect(prefs).toEqual({ thresholdMinutes: GLOBAL, showStale: false, showUnscanned: true });
  });

  it('defensively caps a stale row whose override exceeds the global', async () => {
    // Simulate a row written before the global default was lowered.
    await db
      .update(apUser)
      .set({ staleSignatureThresholdMinutes: GLOBAL + 999 })
      .where(eq(apUser.id, userId));
    const prefs = await getSignatureIndicatorPrefs(userId);
    expect(prefs.thresholdMinutes).toBe(GLOBAL);
  });
});

async function cleanup() {
  await db.delete(apCharacter).where(inArray(apCharacter.id, characterIds));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
}
