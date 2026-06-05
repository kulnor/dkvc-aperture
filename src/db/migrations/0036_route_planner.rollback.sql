DROP TABLE IF EXISTS "ap_route_destination";
--> statement-breakpoint
ALTER TABLE "ap_user" DROP COLUMN "route_include_eve_scout";
--> statement-breakpoint
ALTER TABLE "ap_user" DROP COLUMN "route_avoid_eol";
--> statement-breakpoint
ALTER TABLE "ap_user" DROP COLUMN "route_avoid_critical";
--> statement-breakpoint
ALTER TABLE "ap_user" DROP COLUMN "route_avoid_reduced";
--> statement-breakpoint
ALTER TABLE "ap_user" DROP COLUMN "route_min_ship_class";
--> statement-breakpoint
ALTER TABLE "ap_user" DROP COLUMN "route_safety";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."route_safety";
