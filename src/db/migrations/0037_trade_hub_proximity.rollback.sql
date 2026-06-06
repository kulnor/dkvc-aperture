ALTER TABLE "universe_system" DROP CONSTRAINT IF EXISTS "universe_system_nearest_trade_hub_id_universe_system_id_fk";--> statement-breakpoint
ALTER TABLE "universe_system" DROP COLUMN IF EXISTS "nearest_trade_hub_jumps";--> statement-breakpoint
ALTER TABLE "universe_system" DROP COLUMN IF EXISTS "nearest_trade_hub_id";
