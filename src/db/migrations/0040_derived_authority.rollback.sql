-- Manual rollback for 0040_derived_authority.sql. Drops the alliance cache and
-- the character Director bit. Run by hand (drizzle-kit is forward-only):
--   psql "$DATABASE_URL" -f src/db/migrations/0040_derived_authority.rollback.sql
DROP TABLE IF EXISTS "ap_alliance";
ALTER TABLE "ap_character" DROP COLUMN IF EXISTS "is_director";
