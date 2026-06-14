-- Admin teardown (permissions multi-tenant rework, stage 4) — destructive.
--
-- Finishes the move to EVE-derived map authority by removing the old
-- vocabulary:
--   * Drops `ap_corporation_right` — the per-corp rights matrix. Corp authority
--     is now the derived `ap_character.is_director` bit, not a stored matrix.
--   * Retires the `manage` access capability (the old "manager hand-grant").
--     Any standing `manage` grants are deleted; the `access_capability` enum
--     loses the value. Global `admin` is the only instance-scoped authority
--     capability that survives.
--   * Shrinks `authz_level` from `member|manager|admin` to `member|admin`. Any
--     character cached at `manager` (Director-derived or hand-granted) is
--     remapped to `member`; corp/alliance map authority is carried by
--     `is_director`, and global admin is reached only via an explicit
--     `capability='admin'` grant.
--
-- No back-compat (CLAUDE.md): the deleted `manage` grants and the remapped
-- `manager` levels are data and are not recoverable from the rollback. The
-- `map_right` enum is intentionally kept — it survives as the reserved
-- delegation vocabulary (R4).
--
-- Order is load-bearing: drop the matrix table and the `manage` grants before
-- swapping the enum types those rows reference. Rollback:
-- src/db/migrations/0041_admin_teardown.rollback.sql.

DROP TABLE IF EXISTS "ap_corporation_right";--> statement-breakpoint

DELETE FROM "ap_access_grant" WHERE "capability" = 'manage';--> statement-breakpoint
-- The capability↔scope CHECK references 'manage'; drop it before the type swap
-- (it would fail to re-validate against the new enum) and re-add it without it.
ALTER TABLE "ap_access_grant" DROP CONSTRAINT "ap_access_grant_capability_scope_chk";--> statement-breakpoint
ALTER TYPE "public"."access_capability" RENAME TO "access_capability_old";--> statement-breakpoint
CREATE TYPE "public"."access_capability" AS ENUM('login', 'admin', 'view', 'edit');--> statement-breakpoint
ALTER TABLE "ap_access_grant" ALTER COLUMN "capability" TYPE "public"."access_capability" USING "capability"::text::"public"."access_capability";--> statement-breakpoint
DROP TYPE "public"."access_capability_old";--> statement-breakpoint
ALTER TABLE "ap_access_grant" ADD CONSTRAINT "ap_access_grant_capability_scope_chk" CHECK (("scope" = 'instance' AND "capability" IN ('login', 'admin')) OR ("scope" = 'map' AND "capability" IN ('view', 'edit')));--> statement-breakpoint

UPDATE "ap_character" SET "authz_level" = 'member' WHERE "authz_level" = 'manager';--> statement-breakpoint
ALTER TYPE "public"."authz_level" RENAME TO "authz_level_old";--> statement-breakpoint
CREATE TYPE "public"."authz_level" AS ENUM('member', 'admin');--> statement-breakpoint
ALTER TABLE "ap_character" ALTER COLUMN "authz_level" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ap_character" ALTER COLUMN "authz_level" TYPE "public"."authz_level" USING "authz_level"::text::"public"."authz_level";--> statement-breakpoint
ALTER TABLE "ap_character" ALTER COLUMN "authz_level" SET DEFAULT 'member';--> statement-breakpoint
DROP TYPE "public"."authz_level_old";
