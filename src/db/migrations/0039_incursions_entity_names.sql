-- Intel panel: incursions feed + generic entity-name cache.
--
-- universe_entity_name — id→name cache for faction/alliance/corporation ids shown
--   in the read-side intel module (sovereignty, faction warfare, incursions).
--   Populated by the sov-fw-refresh and incursion-refresh jobs, which resolve only
--   ids missing or older than the cache TTL — never a blind batch re-resolve.
-- universe_incursion — one row per active incursion, full-replaced each refresh by
--   the incursion-refresh job (active incursions are few and short-lived).
CREATE TABLE IF NOT EXISTS "universe_entity_name" (
	"id" bigint PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"last_fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "universe_incursion" (
	"constellation_id" integer PRIMARY KEY NOT NULL,
	"faction_id" bigint,
	"staging_solar_system_id" integer,
	"has_boss" boolean NOT NULL,
	"influence" double precision NOT NULL,
	"state" text NOT NULL,
	"type" text NOT NULL,
	"infested_solar_systems" jsonb NOT NULL,
	CONSTRAINT "universe_incursion_constellation_id_universe_constellation_id_fk" FOREIGN KEY ("constellation_id") REFERENCES "public"."universe_constellation"("id") ON DELETE cascade ON UPDATE no action
);
