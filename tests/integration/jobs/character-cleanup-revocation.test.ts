// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, desc, eq } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apCorporation,
  apJobRun,
  apMap,
  apMapCharacterTracking,
  apUser,
} from '@/db/schema';

// Mock the ESI client before any importer touches it. `fetchAffiliations`,
// `getCharacterRoles`, and `getCharacterTitles` all resolve through `esiCall`.
vi.mock('@/lib/esi/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/esi/client')>();
  return { ...actual, esiCall: vi.fn() };
});

import { esiCall } from '@/lib/esi/client';
import { characterCleanup } from '@/lib/jobs/tasks/characterCleanup';
import { bus } from '@/lib/realtime/bus';
import type { ServerToClientMessage } from '@/lib/realtime/protocol';

/**
 * Coverage for the affiliation sweep + access revocation phase of
 * `character-cleanup`:
 *   - A character whose ESI corp differs from the cached value has their stored
 *     corp refreshed, is pruned from corp/alliance maps they can no longer view,
 *     keeps tracking on maps they still own, and triggers a `characterLogout`
 *     broadcast on the revoked map.
 *
 * DB-gated:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

const CHAR_ID = 93500001n;
const CORP_A = 98000001n; // the corp the character (and the corp map) belongs to
const CORP_B = 98000002n; // the corp ESI now reports — they left CORP_A
const mockedEsiCall = vi.mocked(esiCall);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeHelpers(): JobHelpers {
  return { addJob: vi.fn(async () => ({}) as never) } as unknown as JobHelpers;
}

async function lastRun() {
  const [row] = await db
    .select()
    .from(apJobRun)
    .where(eq(apJobRun.name, 'character-cleanup'))
    .orderBy(desc(apJobRun.startedAt))
    .limit(1);
  return row;
}

describe.skipIf(!run)('character-cleanup affiliation revocation (real Postgres)', () => {
  let userId = 0;
  let corpMapId = 0n;
  let privateMapId = 0n;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await db.delete(apJobRun).where(eq(apJobRun.name, 'character-cleanup'));
    await db.delete(apCharacter).where(eq(apCharacter.id, CHAR_ID));
    await db.delete(apMap).where(eq(apMap.name, 'cleanup-revocation-corp'));
    await db.delete(apMap).where(eq(apMap.name, 'cleanup-revocation-private'));

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;

    // Corp rows for the FK target of ap_character.corporation_id is not enforced
    // (bare bigint), but seed CORP_A so the corp map's owner is realistic.
    await db
      .insert(apCorporation)
      .values({ id: CORP_A, name: 'Corp A', lastSyncedAt: new Date() })
      .onConflictDoNothing();

    const [corpMap] = await db
      .insert(apMap)
      .values({
        scope: 'all',
        type: 'corp',
        ownerCorporationId: CORP_A,
        name: 'cleanup-revocation-corp',
      })
      .returning({ id: apMap.id });
    corpMapId = corpMap!.id;

    const [privateMap] = await db
      .insert(apMap)
      .values({
        scope: 'all',
        type: 'private',
        ownerCharacterId: CHAR_ID,
        name: 'cleanup-revocation-private',
      })
      .returning({ id: apMap.id });
    privateMapId = privateMap!.id;
  }, 120_000);

  afterAll(async () => {
    await db
      .delete(apMapCharacterTracking)
      .where(eq(apMapCharacterTracking.characterId, CHAR_ID));
    await db.delete(apCharacter).where(eq(apCharacter.id, CHAR_ID));
    await db.delete(apMap).where(eq(apMap.id, corpMapId));
    await db.delete(apMap).where(eq(apMap.id, privateMapId));
    await db.delete(apJobRun).where(eq(apJobRun.name, 'character-cleanup'));
    await pool.end();
  });

  beforeEach(async () => {
    mockedEsiCall.mockReset();
    // Fresh character in CORP_A, tracked on both maps. `authz_synced_at` recent
    // so the 6h resync phase doesn't independently touch the row.
    await db
      .insert(apCharacter)
      .values({
        id: CHAR_ID,
        userId,
        name: 'Revocation Test',
        ownerHash: 'oh-rev',
        corporationId: CORP_A,
        allianceId: null,
        esiRefreshToken: 'encrypted-placeholder',
        status: 'active',
        authzLevel: 'member',
        authzSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: apCharacter.id,
        set: {
          corporationId: CORP_A,
          allianceId: null,
          status: 'active',
          authzLevel: 'member',
          authzSyncedAt: new Date(),
        },
      });
    await db
      .insert(apMapCharacterTracking)
      .values([
        { mapId: corpMapId, characterId: CHAR_ID },
        { mapId: privateMapId, characterId: CHAR_ID },
      ])
      .onConflictDoNothing();
  });

  afterEach(async () => {
    await db
      .delete(apMapCharacterTracking)
      .where(eq(apMapCharacterTracking.characterId, CHAR_ID));
    await db.delete(apJobRun).where(eq(apJobRun.name, 'character-cleanup'));
  });

  it('refreshes corp, prunes tracking on the lost corp map, keeps the private map', async () => {
    mockedEsiCall.mockImplementation(async (opKey, opts) => {
      if (opKey === 'getCharacterAffiliation') {
        // ESI now reports the character in CORP_B (they left CORP_A).
        const body = (opts as { body: number[] }).body;
        return body.map((id) => ({ character_id: id, corporation_id: Number(CORP_B) })) as never;
      }
      if (opKey === 'getCharacterRoles') return { roles: [] } as never;
      if (opKey === 'getCharacterTitles') return [] as never;
      throw new Error(`unexpected opKey ${opKey}`);
    });

    await characterCleanup.run(undefined, makeHelpers());

    const [character] = await db
      .select({ corporationId: apCharacter.corporationId })
      .from(apCharacter)
      .where(eq(apCharacter.id, CHAR_ID));
    expect(character!.corporationId).toBe(CORP_B);

    const corpTracking = await db
      .select()
      .from(apMapCharacterTracking)
      .where(
        and(
          eq(apMapCharacterTracking.mapId, corpMapId),
          eq(apMapCharacterTracking.characterId, CHAR_ID),
        ),
      );
    expect(corpTracking).toHaveLength(0); // pruned — no longer in the owning corp

    const privateTracking = await db
      .select()
      .from(apMapCharacterTracking)
      .where(
        and(
          eq(apMapCharacterTracking.mapId, privateMapId),
          eq(apMapCharacterTracking.characterId, CHAR_ID),
        ),
      );
    expect(privateTracking).toHaveLength(1); // still owns their private map

    const job = await lastRun();
    expect(job!.success).toBe(true);
    expect(job!.notes).toMatchObject({ affiliationChanged: 1, trackingPruned: 1 });
  });

  it('leaves tracking intact when the corp is unchanged', async () => {
    mockedEsiCall.mockImplementation(async (opKey, opts) => {
      if (opKey === 'getCharacterAffiliation') {
        const body = (opts as { body: number[] }).body;
        return body.map((id) => ({ character_id: id, corporation_id: Number(CORP_A) })) as never;
      }
      if (opKey === 'getCharacterRoles') return { roles: [] } as never;
      if (opKey === 'getCharacterTitles') return [] as never;
      throw new Error(`unexpected opKey ${opKey}`);
    });

    await characterCleanup.run(undefined, makeHelpers());

    const tracking = await db
      .select()
      .from(apMapCharacterTracking)
      .where(eq(apMapCharacterTracking.characterId, CHAR_ID));
    expect(tracking).toHaveLength(2); // both maps retained
    const job = await lastRun();
    expect(job!.notes).toMatchObject({ affiliationChanged: 0, trackingPruned: 0 });
  });

  it('broadcasts a characterLogout on the revoked map', async () => {
    mockedEsiCall.mockImplementation(async (opKey, opts) => {
      if (opKey === 'getCharacterAffiliation') {
        const body = (opts as { body: number[] }).body;
        return body.map((id) => ({ character_id: id, corporation_id: Number(CORP_B) })) as never;
      }
      if (opKey === 'getCharacterRoles') return { roles: [] } as never;
      if (opKey === 'getCharacterTitles') return [] as never;
      throw new Error(`unexpected opKey ${opKey}`);
    });

    const received: ServerToClientMessage[] = [];
    const unsubscribe = bus.subscribe(corpMapId, (msg) => received.push(msg));
    await delay(200); // let the bus register its LISTEN before pg_notify fires

    await characterCleanup.run(undefined, makeHelpers());
    await delay(500); // pg_notify is fire-and-forget across connections
    unsubscribe();

    const logouts = received.filter((m) => m.task === 'characterLogout');
    expect(logouts.length).toBeGreaterThanOrEqual(1);
    const last = logouts.at(-1)!;
    if (last.task !== 'characterLogout') throw new Error('expected characterLogout');
    expect(last.load.characterIds).toContain(Number(CHAR_ID));
  });
});
