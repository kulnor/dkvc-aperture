-- Manual rollback for 0039_incursions_entity_names.sql. Drops the incursion feed
-- and generic entity-name cache used by the intel module.
--   psql "$DATABASE_URL" -f src/db/migrations/0039_incursions_entity_names.rollback.sql
DROP TABLE IF EXISTS "universe_incursion";
DROP TABLE IF EXISTS "universe_entity_name";
