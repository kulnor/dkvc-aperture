-- Manual rollback for 0041_admin_teardown.sql. Restores the three-value
-- `authz_level` and five-value `access_capability` enums and recreates the
-- `ap_corporation_right` matrix table (definition from
-- 0013_stage15_permissions.sql). Run by hand (drizzle-kit is forward-only):
--   psql "$DATABASE_URL" -f src/db/migrations/0041_admin_teardown.rollback.sql
--
-- NOTE: this only restores schema. The dropped `manage` grants and the
-- characters remapped from `manager` to `member` are data and cannot be
-- recovered here.

ALTER TYPE "public"."authz_level" RENAME TO "authz_level_old";
CREATE TYPE "public"."authz_level" AS ENUM('member', 'manager', 'admin');
ALTER TABLE "ap_character" ALTER COLUMN "authz_level" DROP DEFAULT;
ALTER TABLE "ap_character" ALTER COLUMN "authz_level" TYPE "public"."authz_level" USING "authz_level"::text::"public"."authz_level";
ALTER TABLE "ap_character" ALTER COLUMN "authz_level" SET DEFAULT 'member';
DROP TYPE "public"."authz_level_old";

ALTER TABLE "ap_access_grant" DROP CONSTRAINT "ap_access_grant_capability_scope_chk";
ALTER TYPE "public"."access_capability" RENAME TO "access_capability_old";
CREATE TYPE "public"."access_capability" AS ENUM('login', 'admin', 'manage', 'view', 'edit');
ALTER TABLE "ap_access_grant" ALTER COLUMN "capability" TYPE "public"."access_capability" USING "capability"::text::"public"."access_capability";
DROP TYPE "public"."access_capability_old";
ALTER TABLE "ap_access_grant" ADD CONSTRAINT "ap_access_grant_capability_scope_chk" CHECK (("scope" = 'instance' AND "capability" IN ('login', 'admin', 'manage')) OR ("scope" = 'map' AND "capability" IN ('view', 'edit')));

CREATE TABLE "ap_corporation_right" (
    "corporation_id" bigint NOT NULL,
    "right" "map_right" NOT NULL,
    "min_authz_level" "authz_level" NOT NULL,
    CONSTRAINT "ap_corporation_right_pk" PRIMARY KEY("corporation_id","right")
);
ALTER TABLE "ap_corporation_right" ADD CONSTRAINT "ap_corporation_right_corporation_id_ap_corporation_id_fk" FOREIGN KEY ("corporation_id") REFERENCES "public"."ap_corporation"("id") ON DELETE cascade ON UPDATE no action;
