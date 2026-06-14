-- Derived-authority data (permissions multi-tenant rework, stage 1) — additive.
--
-- Adds:
--   * `ap_character.is_director` — the EVE Director bit `syncCharacterAuthz`
--     already reads from ESI but until now discarded. Persisting it lets the
--     new `canManageMap` / `canCreateMapOfType` gates derive corp/alliance map
--     authority straight from EVE state.
--   * `ap_alliance` — a minimal alliance cache mirroring `ap_corporation`,
--     carrying `executor_corporation_id` so alliance-map authority can be
--     pinned to the executor corp's Directors. Upserted by `syncCharacterAuthz`
--     from ESI `getAlliance` whenever a synced character has an alliance.
--
-- No behaviour change yet: the new authority functions in `rights.ts` are added
-- alongside the old gates and not yet wired in (that is stage 2). Rollback:
-- src/db/migrations/0040_derived_authority.rollback.sql.

ALTER TABLE "ap_character" ADD COLUMN "is_director" boolean DEFAULT false NOT NULL;--> statement-breakpoint

CREATE TABLE "ap_alliance" (
    "id" bigint PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "executor_corporation_id" bigint,
    "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
