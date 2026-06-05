-- routes-module. Per-account route-planner settings + saved destinations.
--
-- The planner computes a shortest path from a picked character's current system
-- to each saved destination, traversing K-space stargates and the live wormhole
-- chain (optionally the public EVE-Scout network). Settings are personal config
-- on `ap_user` (applied to every map, never map data — no `ap_map_event`); the
-- destination list is its own table with a real FK to `universe_system`.
--
-- Rollback: src/db/migrations/0036_route_planner.rollback.sql.

CREATE TYPE "public"."route_safety" AS ENUM('shortest', 'safer', 'less_safe');
--> statement-breakpoint
ALTER TABLE "ap_user" ADD COLUMN "route_safety" "route_safety" DEFAULT 'shortest' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ap_user" ADD COLUMN "route_min_ship_class" "wh_jump_mass";
--> statement-breakpoint
ALTER TABLE "ap_user" ADD COLUMN "route_avoid_reduced" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "ap_user" ADD COLUMN "route_avoid_critical" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "ap_user" ADD COLUMN "route_avoid_eol" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "ap_user" ADD COLUMN "route_include_eve_scout" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ap_route_destination" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"system_id" integer NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ap_route_destination_user_id_system_id_key" UNIQUE("user_id","system_id"),
	CONSTRAINT "ap_route_destination_user_id_ap_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ap_user"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "ap_route_destination_system_id_universe_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_system"("id") ON DELETE restrict ON UPDATE no action
);
