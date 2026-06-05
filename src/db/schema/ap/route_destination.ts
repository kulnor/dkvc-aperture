import { bigserial, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { universeSystem } from '../universe/geography';
import { apUser } from './user';

// routes-module: a saved route-planner destination, owned by an account. The
// route planner computes a path from a picked character's current system to each
// of the account's destinations. Personal config — not map data — so it never
// touches `ap_map_event`. The `system_id` FK is a real cross-`ap_`/`universe_`
// boundary reference (per the DB rules), RESTRICT so a universe rebuild can't
// silently drop a saved destination.
export const apRouteDestination = pgTable(
  'ap_route_destination',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => apUser.id, { onDelete: 'cascade' }),
    systemId: integer('system_id')
      .notNull()
      .references(() => universeSystem.id, { onDelete: 'restrict' }),
    // Optional pilot alias for the destination ("Home", "Staging"); falls back to
    // the system name in the UI when null.
    label: text('label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('ap_route_destination_user_id_system_id_key').on(t.userId, t.systemId)],
);
