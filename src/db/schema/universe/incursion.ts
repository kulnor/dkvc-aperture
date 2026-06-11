import { bigint, boolean, doublePrecision, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { universeConstellation } from './geography';

// Active incursions from ESI (`/incursions/`), refreshed every ~5 min by the
// `incursion-refresh` job. One row per incursion constellation; the table is
// full-replaced each run since active incursions are few and short-lived. The
// read-side intel module maps a system to its incursion via `infested_solar_systems`.
export const universeIncursion = pgTable('universe_incursion', {
  constellationId: integer('constellation_id')
    .primaryKey()
    .references(() => universeConstellation.id, { onDelete: 'cascade' }),
  factionId: bigint('faction_id', { mode: 'bigint' }),
  stagingSolarSystemId: integer('staging_solar_system_id'),
  hasBoss: boolean('has_boss').notNull(),
  influence: doublePrecision('influence').notNull(),
  state: text('state').notNull(),
  type: text('type').notNull(),
  // EVE solar-system ids infested by this incursion.
  infestedSolarSystems: jsonb('infested_solar_systems').$type<number[]>().notNull(),
});
