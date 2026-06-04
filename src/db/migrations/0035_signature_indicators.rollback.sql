ALTER TABLE "ap_user" DROP COLUMN "show_unscanned_signature_indicator";
ALTER TABLE "ap_user" DROP COLUMN "show_stale_signature_indicator";
ALTER TABLE "ap_user" DROP COLUMN "stale_signature_threshold_minutes";
ALTER TABLE "ap_instance" DROP COLUMN "stale_signature_threshold_minutes";
