import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Generic ESI id→name cache for faction/alliance/corporation ids surfaced in the
// read-side intel module (sovereignty, faction warfare, incursions). Populated by
// the `sov-fw-refresh` and `incursion-refresh` jobs, which resolve only ids missing
// or older than the cache TTL — never a blind batch re-resolve. `category` is the
// `getUniverseNames` category ('faction' | 'alliance' | 'corporation').
//
// Distinct from `universe_corporation`: that cache backs the structure-owner FK and
// is corp-only; this one holds any displayed entity regardless of type.
export const universeEntityName = pgTable('universe_entity_name', {
  // EVE entity id is the natural 64-bit key — not generated.
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  category: text('category').notNull(),
  name: text('name').notNull(),
  // Drives opportunistic re-resolution: ids fresher than the TTL are skipped.
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }).notNull().defaultNow(),
});
