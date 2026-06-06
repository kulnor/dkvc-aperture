-- Trade-hub proximity. Two derived columns on universe_system recording the
-- nearest configured trade hub reachable via a high-sec-only gate route within
-- the hub's proximity radius (precomputed at SDE ingest by computeHubProximity).
-- nearest_trade_hub_id self-references universe_system so erasing a hub system
-- nulls the pointer rather than orphaning it.
--
-- Rollback: src/db/migrations/0037_trade_hub_proximity.rollback.sql.

ALTER TABLE "universe_system" ADD COLUMN "nearest_trade_hub_id" integer;--> statement-breakpoint
ALTER TABLE "universe_system" ADD COLUMN "nearest_trade_hub_jumps" integer;--> statement-breakpoint
ALTER TABLE "universe_system" ADD CONSTRAINT "universe_system_nearest_trade_hub_id_universe_system_id_fk" FOREIGN KEY ("nearest_trade_hub_id") REFERENCES "public"."universe_system"("id") ON DELETE set null ON UPDATE no action;
