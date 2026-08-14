-- Consent is required at collection under India's DPDP Act, so it gets a real
-- table rather than a boolean on users: an audit asks what was consented to,
-- when, and under which policy text.
CREATE TYPE "ConsentType" AS ENUM ('health_data', 'minor_guardian', 'marketing_notifications', 'photo_retention');

CREATE TABLE "consent_records" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "consent_type" "ConsentType" NOT NULL,
  "granted_by_user_id" UUID NOT NULL,
  "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "policy_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_records_user_id_consent_type_idx" ON "consent_records" ("user_id", "consent_type");

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_granted_by_user_id_fkey"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER consent_records_set_updated_at
  BEFORE UPDATE ON "consent_records"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every user now originates from Supabase Auth, so the link is mandatory.
ALTER TABLE "users" ALTER COLUMN "auth_user_id" SET NOT NULL;
