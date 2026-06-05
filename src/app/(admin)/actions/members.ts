'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { apAccessGrant, apCharacter } from '@/db/schema';
import { auth } from '@/lib/auth';
import {
  adminVisibilityScope,
  characterScopeFilterFor,
  isAdmin,
  isManagerOrAdmin,
  type AdminVisibilityScope,
} from '@/lib/auth/rights';
import { addInstanceGrant } from '@/lib/auth/instanceConfig';
import { syncCharacterAuthz } from '@/lib/auth/syncCharacterAuthz';

/**
 * Admin actions on `ap_character` rows: moderation
 * (`kick` / `ban` / `activate`) and authz toggle
 * (`grantManager` / `revokeManager`). Gated by `isManagerOrAdmin` +
 * `adminVisibilityScope`; the two authz actions further require `isAdmin`
 * (managers may moderate within their corp but cannot mint other managers).
 *
 * Moderation actions write directly to `ap_character`. The manager toggle does
 * NOT — it writes an `ap_access_grant`
 * (`scope='instance', capability='manage'`) and re-resyncs the target so the
 * recomputed `ap_character.authz_level` cache reflects it. The grant row is the
 * source of truth; `authz_level` is just its cache (see
 * `src/lib/auth/resolveAuthz.ts`). Super-admin (`capability='admin'`) is *not*
 * grant-toggled here — it is a `/setup` concern.
 *
 * No `ap_map_event` audit row is written for any of these (`ap_map_event` is
 * map-scoped, so character-moderation changes are intentionally out of its scope). The
 * dashboard counts in `/admin` reflect the new state on next load via
 * `revalidatePath`.
 */

const characterIdSchema = z.string().regex(/^\d+$/, 'Invalid character id.');
const kickMinutesSchema = z.union([
  z.literal(5),
  z.literal(60),
  z.literal(1440),
]);
const reasonSchema = z.string().trim().min(1).max(500);
const optionalReasonSchema = z
  .string()
  .trim()
  .max(500)
  .transform((s) => (s.length === 0 ? null : s))
  .nullable()
  .optional();

type ActionResult = { ok: true } | { ok: false; error: string };

type TargetRow = {
  id: bigint;
  status: 'active' | 'kicked' | 'banned';
  authzLevel: 'member' | 'manager' | 'admin';
};

async function selectScopedCharacter(
  id: bigint,
  scope: AdminVisibilityScope,
): Promise<TargetRow | null> {
  const where = and(eq(apCharacter.id, id), characterScopeFilterFor(scope));
  const [row] = await db
    .select({
      id: apCharacter.id,
      status: apCharacter.status,
      authzLevel: apCharacter.authzLevel,
    })
    .from(apCharacter)
    .where(where);
  return row ?? null;
}

async function gateManagerOrAdmin(): Promise<
  | { ok: true; scope: AdminVisibilityScope }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!(await isManagerOrAdmin(session))) {
    return { ok: false, error: 'Forbidden.' };
  }
  const scope = await adminVisibilityScope(session);
  if (scope === null) return { ok: false, error: 'Forbidden.' };
  return { ok: true, scope };
}

async function gateAdmin(): Promise<
  | { ok: true; scope: AdminVisibilityScope; actorId: bigint }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!(await isAdmin(session))) {
    return { ok: false, error: 'Admin required.' };
  }
  // Admin scope is always `global`; we still call the helper for the type.
  const scope = await adminVisibilityScope(session);
  if (scope === null) return { ok: false, error: 'Admin required.' };
  // `isAdmin` guarantees an authenticated character.
  return { ok: true, scope, actorId: BigInt(session!.characterId!) };
}

/**
 * Recompute and persist the target's cached `ap_character.authz_level` after a
 * manager grant change. Delegates to the full ESI-backed `syncCharacterAuthz`
 * so the Director-derived component is re-evaluated alongside the explicit
 * grant — a revoke only drops the level to `member` when the character is *not*
 * also an in-game Director. If ESI is unreachable the resync is skipped and the
 * grant reconciles on the next periodic `character-cleanup` pass; the grant row
 * is already the source of truth.
 */
async function resyncCachedLevel(characterId: bigint): Promise<void> {
  await syncCharacterAuthz(characterId);
}

/**
 * Set `status='kicked'` with a fixed-minutes timeout. The `character-cleanup`
 * cron flips the row back to `'active'` on expiry (`src/lib/jobs/tasks/characterCleanup.ts`).
 * Three durations only — 5, 60, 1440 minutes.
 */
export async function adminKickCharacter(
  characterId: string,
  minutes: 5 | 60 | 1440,
  reason?: string,
): Promise<ActionResult> {
  const parsedId = characterIdSchema.safeParse(characterId);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0]!.message };
  const parsedMinutes = kickMinutesSchema.safeParse(minutes);
  if (!parsedMinutes.success) return { ok: false, error: 'Invalid kick duration.' };
  const parsedReason = optionalReasonSchema.safeParse(reason);
  if (!parsedReason.success) return { ok: false, error: 'Invalid reason.' };

  const gate = await gateManagerOrAdmin();
  if (!gate.ok) return gate;
  const id = BigInt(parsedId.data);
  const target = await selectScopedCharacter(id, gate.scope);
  if (target === null) return { ok: false, error: 'Character not found.' };

  await db
    .update(apCharacter)
    .set({
      status: 'kicked',
      statusExpiresAt: sql`now() + (${parsedMinutes.data} * interval '1 minute')`,
      statusReason: parsedReason.data ?? null,
      statusChangedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(apCharacter.id, id));

  revalidatePath('/admin/members');
  revalidatePath('/admin');
  return { ok: true };
}

/**
 * Set `status='banned'` permanently — `status_expires_at` stays NULL so the
 * `character-cleanup` cron never lifts it. A free-text `reason` is required.
 */
export async function adminBanCharacter(
  characterId: string,
  reason: string,
): Promise<ActionResult> {
  const parsedId = characterIdSchema.safeParse(characterId);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0]!.message };
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) return { ok: false, error: 'Reason is required.' };

  const gate = await gateManagerOrAdmin();
  if (!gate.ok) return gate;
  const id = BigInt(parsedId.data);
  const target = await selectScopedCharacter(id, gate.scope);
  if (target === null) return { ok: false, error: 'Character not found.' };

  await db
    .update(apCharacter)
    .set({
      status: 'banned',
      statusExpiresAt: null,
      statusReason: parsedReason.data,
      statusChangedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(apCharacter.id, id));

  revalidatePath('/admin/members');
  revalidatePath('/admin');
  return { ok: true };
}

/**
 * Clear any moderation state — works on both `'kicked'` and `'banned'` rows.
 * Sets `status='active'` and nulls `status_expires_at` / `status_reason`.
 */
export async function adminActivateCharacter(
  characterId: string,
): Promise<ActionResult> {
  const parsedId = characterIdSchema.safeParse(characterId);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0]!.message };

  const gate = await gateManagerOrAdmin();
  if (!gate.ok) return gate;
  const id = BigInt(parsedId.data);
  const target = await selectScopedCharacter(id, gate.scope);
  if (target === null) return { ok: false, error: 'Character not found.' };

  await db
    .update(apCharacter)
    .set({
      status: 'active',
      statusExpiresAt: null,
      statusReason: null,
      statusChangedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(apCharacter.id, id));

  revalidatePath('/admin/members');
  revalidatePath('/admin');
  return { ok: true };
}

/**
 * Admin-only. Grant a character corp-scoped `manager`. Writes an
 * `ap_access_grant` (`scope='instance', capability='manage'`) — the durable
 * source of truth — then re-resyncs so the recomputed `authz_level` cache
 * reflects it. Idempotent: re-granting refreshes the existing grant row (see
 * `addInstanceGrant`). Refused on an `admin` row — super-admin is issued and
 * revoked from `/setup`, not toggled here.
 */
export async function adminGrantManager(
  characterId: string,
): Promise<ActionResult> {
  const parsedId = characterIdSchema.safeParse(characterId);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0]!.message };

  const gate = await gateAdmin();
  if (!gate.ok) return gate;
  const id = BigInt(parsedId.data);
  const target = await selectScopedCharacter(id, gate.scope);
  if (target === null) return { ok: false, error: 'Character not found.' };

  if (target.authzLevel === 'admin') {
    return { ok: false, error: 'Character is a super-admin; manage is governed from /setup.' };
  }

  await addInstanceGrant({
    principalKind: 'character',
    principalId: id,
    capability: 'manage',
    grantedByCharacterId: gate.actorId,
  });
  await resyncCachedLevel(id);

  revalidatePath('/admin/members');
  return { ok: true };
}

/**
 * Admin-only. Revoke a character's hand-granted `manage`. Deletes the
 * `ap_access_grant` row and re-resyncs. Note the cache may stay `manager` after
 * a revoke: if the character also holds the in-game corp Director role,
 * `resolveAuthzLevel` re-derives `manager` from that (revoke the Director title
 * in EVE to clear it). Refused on an `admin` row — super-admin lives in
 * `/setup`. Reports a clear error when there is no manage grant to revoke but
 * the character is a Director-derived manager.
 */
export async function adminRevokeManager(
  characterId: string,
): Promise<ActionResult> {
  const parsedId = characterIdSchema.safeParse(characterId);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0]!.message };

  const gate = await gateAdmin();
  if (!gate.ok) return gate;
  const id = BigInt(parsedId.data);
  const target = await selectScopedCharacter(id, gate.scope);
  if (target === null) return { ok: false, error: 'Character not found.' };

  if (target.authzLevel === 'admin') {
    return { ok: false, error: 'Character is a super-admin; revoke it from /setup.' };
  }

  const deleted = await db
    .delete(apAccessGrant)
    .where(
      and(
        eq(apAccessGrant.principalKind, 'character'),
        eq(apAccessGrant.principalId, id),
        eq(apAccessGrant.scope, 'instance'),
        eq(apAccessGrant.capability, 'manage'),
      ),
    )
    .returning({ id: apAccessGrant.id });

  if (deleted.length === 0) {
    // No hand-grant to drop. A standing `manager` here is Director-derived and
    // can only be cleared by removing the corp Director title in EVE.
    if (target.authzLevel === 'manager') {
      return {
        ok: false,
        error: "Manager is derived from the character's in-game Director role and cannot be revoked here.",
      };
    }
    return { ok: true };
  }

  await resyncCachedLevel(id);

  revalidatePath('/admin/members');
  return { ok: true };
}
