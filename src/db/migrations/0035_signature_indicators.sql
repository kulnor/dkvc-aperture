-- Stale & unscanned signature indicators.
--
-- A global default threshold lives on the singleton `ap_instance` (minutes); a
-- system whose newest signature is older than the effective threshold (or a
-- wormhole system with no signatures at all) is flagged on the map. Each account
-- may override the threshold to a *smaller* value on `ap_user` (NULL ⇒ use the
-- global default; the override is capped at the global on write) and toggle each
-- indicator on/off. Defaults keep both indicators on for every existing account.
--
-- Rollback: src/db/migrations/0035_signature_indicators.rollback.sql.

ALTER TABLE "ap_instance" ADD COLUMN "stale_signature_threshold_minutes" integer DEFAULT 240 NOT NULL;

ALTER TABLE "ap_user" ADD COLUMN "stale_signature_threshold_minutes" integer;
ALTER TABLE "ap_user" ADD COLUMN "show_stale_signature_indicator" boolean DEFAULT true NOT NULL;
ALTER TABLE "ap_user" ADD COLUMN "show_unscanned_signature_indicator" boolean DEFAULT true NOT NULL;
