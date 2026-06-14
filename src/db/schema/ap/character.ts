import { bigint, boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { authzLevel, characterStatus } from './enums';
import { apUser } from './user';

// ESI tokens live directly on the character row, not a separate auth table. The
// access/refresh tokens are stored as ciphertext blobs produced by
// `src/lib/crypto.ts`; nothing here ever holds plaintext.
export const apCharacter = pgTable('ap_character', {
  // EVE character id is a natural 64-bit key — not generated.
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => apUser.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // CCP rotates `owner_hash` when a character is transferred between accounts;
  // it is the canonical "same character" signal.
  ownerHash: text('owner_hash').notNull(),
  // Membership ids. Stored as plain nullable bigints (no FK to ap_corporation /
  // ap_alliance).
  corporationId: bigint('corporation_id', { mode: 'bigint' }),
  allianceId: bigint('alliance_id', { mode: 'bigint' }),
  // Encrypted at rest (AES-256-GCM, see src/lib/crypto.ts).
  esiAccessToken: text('esi_access_token'),
  esiRefreshToken: text('esi_refresh_token'),
  esiAccessTokenExpires: timestamp('esi_access_token_expires', { withTimezone: true }),
  esiScopes: text('esi_scopes').array(),
  status: characterStatus('status').notNull().default('active'),
  statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
  statusReason: text('status_reason'),
  // Set on a `kicked` row to the moment the timeout expires; the
  // `character-cleanup` cron flips `status` back to `'active'` and clears this
  // when `now() >= status_expires_at`. NULL for `'active'` and `'banned'` rows
  // (bans are permanent).
  statusExpiresAt: timestamp('status_expires_at', { withTimezone: true }),
  authzLevel: authzLevel('authz_level').notNull().default('member'),
  // The EVE corporation "Director" role, refreshed from ESI every
  // `syncCharacterAuthz` pass. Carries corp/alliance map-management authority in
  // the derived-authority model (`canManageMap`); distinct from `authz_level`,
  // which is the instance-operator tier.
  isDirector: boolean('is_director').notNull().default(false),
  // When `syncCharacterAuthz` last reconciled this row's
  // `authz_level`, `corporation_id`, `alliance_id`, and `ap_character_role`
  // membership against ESI. Used by the `character-cleanup` job to throttle
  // resync work to stale rows only.
  authzSyncedAt: timestamp('authz_synced_at', { withTimezone: true }),
  // Last-known state cached on the row by the
  // location-poll job; nullable until the first successful tick. No FK to
  // `universe_system` — a universe rebuild would otherwise have to honour
  // every stale pointer, and the next poll tick overwrites the value anyway.
  lastSystemId: integer('last_system_id'),
  lastShipTypeId: integer('last_ship_type_id'),
  // The pilot's custom ship name (ESI `getCharacterShip.ship_name`) — what the
  // player named this particular hull, distinct from its type. Surfaced in the
  // presence hover panel alongside the resolved type name.
  lastShipName: text('last_ship_name'),
  lastOnline: boolean('last_online'),
  lastLocationAt: timestamp('last_location_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
