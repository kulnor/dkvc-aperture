import { bigint, index, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { apCharacter } from './character';
import { apMap } from './map';

// Join table backing the server-side per-character location-poll.
// A row means "the location-poll job for this character should
// fold its detected jumps onto this map". A character may have rows on
// multiple maps simultaneously.
//
// Cascade behavior: deleting the map or the character removes the tracking
// row. The character row itself is rarely hard-deleted (kick/ban use the
// `character_status` enum); map soft-delete (`ap_map.deleted_at`) does NOT
// touch tracking rows — that's only cleared by the 30-day hard-purge cascade
// (`map-purge`).
//
// The location-poll handler starts at "for this character, list
// every tracked map" — the `tracking_character_idx` index covers that path.
export const apMapCharacterTracking = pgTable(
  'ap_map_character_tracking',
  {
    mapId: bigint('map_id', { mode: 'bigint' })
      .notNull()
      .references(() => apMap.id, { onDelete: 'cascade' }),
    characterId: bigint('character_id', { mode: 'bigint' })
      .notNull()
      .references(() => apCharacter.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.mapId, t.characterId] }),
    index('ap_map_character_tracking_character_idx').on(t.characterId),
  ],
);
