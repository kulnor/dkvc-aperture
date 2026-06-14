import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Minimal alliance row — created on demand by `syncCharacterAuthz` whenever a
// synced character belongs to an alliance and no matching row exists yet. The
// derived-authority model reads `executor_corporation_id` to decide which
// corp's Directors may manage the alliance's maps (`canManageMap`).
//
// `name` and `executor_corporation_id` are refreshed from ESI `getAlliance`
// each time a member of the alliance logs in or is resync'd; they are
// best-effort and may lag reality between sync ticks. `executor_corporation_id`
// is nullable — a closed or dissolving alliance has no executor. No
// active/deleted flag, mirroring `ap_corporation`: defunct alliances simply
// stop being referenced and the row stays as historical record.
export const apAlliance = pgTable('ap_alliance', {
  // EVE alliance id is the natural 64-bit key — not generated.
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  name: text('name').notNull(),
  executorCorporationId: bigint('executor_corporation_id', { mode: 'bigint' }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
});
