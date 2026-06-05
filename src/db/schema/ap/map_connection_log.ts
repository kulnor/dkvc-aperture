import { bigint, bigserial, index, integer, pgTable, timestamp } from 'drizzle-orm/pg-core';
import { apCharacter } from './character';
import { apMapConnection } from './map_connection';
import { universeType } from '../universe/items';

// Per-jump mass accounting for a wormhole connection. Rows are
// written server-side by the location-poll when a tracked character jumps a hole
// (see `src/lib/map/connectionMassLog.ts`); the inspector renders the running
// cumulative total. Decoupled from `ap_map_connection.mass_status` (which mirrors
// the in-game UI) — this is a forensics/estimation aid.
//
// `connection_id` cascades: a collapsed hole is hard-deleted and takes its log
// with it. `character_id` / `ship_type_id` are SET NULL so the audit (who jumped,
// in what) survives account erasure / SDE churn. `mass` is snapshotted at log
// time so later SDE drift never rewrites history.
export const apMapConnectionLog = pgTable(
  'ap_map_connection_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    connectionId: bigint('connection_id', { mode: 'bigint' })
      .notNull()
      .references(() => apMapConnection.id, { onDelete: 'cascade' }),
    characterId: bigint('character_id', { mode: 'bigint' }).references(() => apCharacter.id, {
      onDelete: 'set null',
    }),
    shipTypeId: integer('ship_type_id').references(() => universeType.id, { onDelete: 'set null' }),
    // kg for this single jump, snapshotted at log time.
    mass: bigint('mass', { mode: 'bigint' }).notNull(),
    jumpedAt: timestamp('jumped_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ap_map_connection_log_connection_id_idx').on(t.connectionId)],
);
