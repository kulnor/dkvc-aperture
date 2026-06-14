import { sql } from 'drizzle-orm';
import { bigint, bigserial, check, index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { apCharacter } from './character';
import { accessCapability, accessPrincipal, accessScope } from './enums';
import { apMap } from './map';

// Permissions-overhaul. The unified grant table — the heart of the "smarter"
// access model. One row = one principal (character/corp/alliance/role) granted
// one capability at one scope.
//
// What each row means now:
//   * scope='instance', capability='login'  — allowlist entry.
//   * scope='instance', capability='admin'  — explicit super-admin hand-grant
//     on a character (read by `resolveAuthzLevel`).
// Reserved for the later sharing feature (table exists now; read-path consult
// is added with that feature):
//   * scope='map', capability='view' | 'edit'         — a named-entity map share
//     (`expires_at` non-null ⇒ temporary, auto-revoked).
//
// `expires_at` NULL means permanent; a past `expires_at` means the grant is
// ignored (callers filter on `now()`), and a future sweep deletes the row.
export const apAccessGrant = pgTable(
  'ap_access_grant',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    principalKind: accessPrincipal('principal_kind').notNull(),
    // EVE id (character/corp/alliance) or `ap_role.id` when kind='role'. No FK:
    // the principal may not have an `ap_*` row yet (an allowlisted corp nobody
    // from has logged in for) and roles/corps live in different tables.
    principalId: bigint('principal_id', { mode: 'bigint' }).notNull(),
    scope: accessScope('scope').notNull(),
    // NULL ⇔ scope='instance' (CHECK below). FK so a deleted map drops its
    // shares.
    mapId: bigint('map_id', { mode: 'bigint' }).references(() => apMap.id, {
      onDelete: 'cascade',
    }),
    capability: accessCapability('capability').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    note: text('note'),
    // The admin/operator who issued the grant; SET NULL so erasing them keeps
    // the audit trail.
    grantedByCharacterId: bigint('granted_by_character_id', { mode: 'bigint' }).references(
      () => apCharacter.id,
      { onDelete: 'set null' },
    ),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one row per (principal, scope, map, capability). NULLS NOT
    // DISTINCT so instance grants (map_id NULL) still dedupe — Postgres would
    // otherwise treat two NULL map_ids as distinct and allow duplicates.
    unique('ap_access_grant_principal_capability_uq')
      .on(t.principalKind, t.principalId, t.scope, t.mapId, t.capability)
      .nullsNotDistinct(),
    // scope and map_id move together.
    check('ap_access_grant_scope_map_chk', sql`(${t.scope} = 'instance') = (${t.mapId} is null)`),
    // capability pairs with scope: instance caps are login/admin; map caps are
    // view/edit.
    check(
      'ap_access_grant_capability_scope_chk',
      sql`(${t.scope} = 'instance' and ${t.capability} in ('login', 'admin'))
          or (${t.scope} = 'map' and ${t.capability} in ('view', 'edit'))`,
    ),
    // Resolver lookup: "all grants for this principal".
    index('ap_access_grant_principal_idx').on(t.principalKind, t.principalId),
    // Sharing read-path: "all grants on this map".
    index('ap_access_grant_map_id_idx').on(t.mapId),
  ],
);
