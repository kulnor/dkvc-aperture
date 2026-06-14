// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { db, pool } from '@/db/client';
import { apCharacter, apCorporation, apUser } from '@/db/schema';

/**
 * Admin moderation actions (real Postgres), post Stage-4 teardown.
 *
 * Drives `adminKickCharacter` / `adminBanCharacter` / `adminActivateCharacter`
 * end to end and asserts:
 *   - kick sets `status='kicked'` with `status_expires_at` set;
 *   - ban sets `status='banned'` with NULL expiry;
 *   - activate clears both kick and ban;
 *   - all three are global-admin-only — a corp Director, a plain member, and an
 *     unauthenticated session are all denied. (The `manager` tier and the
 *     grant/revoke-manager toggles were removed; moderation no longer has a
 *     corp-scoped path.)
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test admin-members
 */
const run = process.env.RUN_DB_TESTS === '1';

let currentSession: Session | null = null;
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => currentSession) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { adminKickCharacter, adminBanCharacter, adminActivateCharacter } = await import(
  '@/app/(admin)/actions/members'
);

const CORP_A = 96000011n;
const ALLIANCE_A = 96000911n;

const ADMIN_ID = 96002001n;
const DIRECTOR_ID = 96002002n; // corp Director (member authz) — must be denied moderation
const MEMBER_A_ID = 96002004n;
const TARGET_A_ID = 96002005n; // ordinary member — every action's target

let userId = 0;

const characterIds = [ADMIN_ID, DIRECTOR_ID, MEMBER_A_ID, TARGET_A_ID];

function asSession(characterId: bigint): Session {
  return { characterId: characterId.toString(), user: { id: '0' } } as unknown as Session;
}

async function loadStatus(id: bigint) {
  const [row] = await db
    .select({
      status: apCharacter.status,
      statusExpiresAt: apCharacter.statusExpiresAt,
      statusReason: apCharacter.statusReason,
      authzLevel: apCharacter.authzLevel,
    })
    .from(apCharacter)
    .where(eq(apCharacter.id, id));
  return row!;
}

async function resetTargetA(): Promise<void> {
  await db
    .update(apCharacter)
    .set({
      status: 'active',
      statusExpiresAt: null,
      statusReason: null,
      statusChangedAt: null,
      authzLevel: 'member',
    })
    .where(eq(apCharacter.id, TARGET_A_ID));
}

describe.skipIf(!run)('admin moderation actions (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;

    await db.insert(apCorporation).values([
      { id: CORP_A, name: 'Admin Test Corp A', allianceId: ALLIANCE_A },
    ]);

    await db.insert(apCharacter).values([
      {
        id: ADMIN_ID,
        userId,
        name: 'Super Admin',
        ownerHash: `hash-${ADMIN_ID.toString()}`,
        authzLevel: 'admin',
        corporationId: CORP_A,
        allianceId: ALLIANCE_A,
      },
      {
        id: DIRECTOR_ID,
        userId,
        name: 'Corp Director',
        ownerHash: `hash-${DIRECTOR_ID.toString()}`,
        isDirector: true,
        corporationId: CORP_A,
        allianceId: ALLIANCE_A,
      },
      {
        id: MEMBER_A_ID,
        userId,
        name: 'Member Corp A',
        ownerHash: `hash-${MEMBER_A_ID.toString()}`,
        corporationId: CORP_A,
        allianceId: ALLIANCE_A,
      },
      {
        id: TARGET_A_ID,
        userId,
        name: 'Target Corp A',
        ownerHash: `hash-${TARGET_A_ID.toString()}`,
        corporationId: CORP_A,
        allianceId: ALLIANCE_A,
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  beforeEach(async () => {
    currentSession = null;
    await resetTargetA();
  });

  // ─── kick ────────────────────────────────────────────────────────────────

  it('adminKickCharacter as admin sets kicked + 60-min expiry', async () => {
    currentSession = asSession(ADMIN_ID);
    const before = Date.now();
    const result = await adminKickCharacter(TARGET_A_ID.toString(), 60, 'spamming');
    expect(result.ok).toBe(true);

    const row = await loadStatus(TARGET_A_ID);
    expect(row.status).toBe('kicked');
    expect(row.statusReason).toBe('spamming');
    expect(row.statusExpiresAt).toBeInstanceOf(Date);
    const minutesAhead = (row.statusExpiresAt!.getTime() - before) / 60000;
    // Allow a generous window — actions run sequentially against the DB, so
    // the round-trip can take a second or two on slow CI.
    expect(minutesAhead).toBeGreaterThan(59);
    expect(minutesAhead).toBeLessThan(61);
  });

  it('adminKickCharacter refuses unknown duration', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminKickCharacter(TARGET_A_ID.toString(), 30 as never);
    expect(result.ok).toBe(false);
  });

  // ─── ban ─────────────────────────────────────────────────────────────────

  it('adminBanCharacter clears expiry and stores reason', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminBanCharacter(TARGET_A_ID.toString(), 'multibox cheating');
    expect(result.ok).toBe(true);

    const row = await loadStatus(TARGET_A_ID);
    expect(row.status).toBe('banned');
    expect(row.statusExpiresAt).toBeNull();
    expect(row.statusReason).toBe('multibox cheating');
  });

  it('adminBanCharacter requires a non-empty reason', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminBanCharacter(TARGET_A_ID.toString(), '');
    expect(result.ok).toBe(false);
  });

  // ─── activate ────────────────────────────────────────────────────────────

  it('adminActivateCharacter clears a kicked row', async () => {
    currentSession = asSession(ADMIN_ID);
    await adminKickCharacter(TARGET_A_ID.toString(), 1440);
    const result = await adminActivateCharacter(TARGET_A_ID.toString());
    expect(result.ok).toBe(true);

    const row = await loadStatus(TARGET_A_ID);
    expect(row.status).toBe('active');
    expect(row.statusExpiresAt).toBeNull();
    expect(row.statusReason).toBeNull();
  });

  it('adminActivateCharacter clears a banned row', async () => {
    currentSession = asSession(ADMIN_ID);
    await adminBanCharacter(TARGET_A_ID.toString(), 'test');
    const result = await adminActivateCharacter(TARGET_A_ID.toString());
    expect(result.ok).toBe(true);
    expect((await loadStatus(TARGET_A_ID)).status).toBe('active');
  });

  // ─── auth gate (admin-only) ────────────────────────────────────────────────

  it('a corp Director is denied every moderation action (admin-only)', async () => {
    currentSession = asSession(DIRECTOR_ID);
    expect((await adminKickCharacter(TARGET_A_ID.toString(), 5)).ok).toBe(false);
    expect((await adminBanCharacter(TARGET_A_ID.toString(), 'x')).ok).toBe(false);
    expect((await adminActivateCharacter(TARGET_A_ID.toString())).ok).toBe(false);
    expect((await loadStatus(TARGET_A_ID)).status).toBe('active');
  });

  it('a plain member is denied every moderation action', async () => {
    currentSession = asSession(MEMBER_A_ID);
    expect((await adminKickCharacter(TARGET_A_ID.toString(), 5)).ok).toBe(false);
    expect((await adminBanCharacter(TARGET_A_ID.toString(), 'x')).ok).toBe(false);
    expect((await adminActivateCharacter(TARGET_A_ID.toString())).ok).toBe(false);
  });

  it('an unauthenticated session is denied every moderation action', async () => {
    currentSession = null;
    expect((await adminKickCharacter(TARGET_A_ID.toString(), 5)).ok).toBe(false);
    expect((await adminBanCharacter(TARGET_A_ID.toString(), 'x')).ok).toBe(false);
    expect((await adminActivateCharacter(TARGET_A_ID.toString())).ok).toBe(false);
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
