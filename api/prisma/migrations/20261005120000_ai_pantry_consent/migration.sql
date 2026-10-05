-- Opt-in consent to having typed pantry text read by an outside AI service.
-- Off by default for every existing and future profile.
ALTER TABLE "profiles" ADD COLUMN     "ai_pantry_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_pantry_consent_at" TIMESTAMP(3);

-- The timestamp says when consent was given, so it exists exactly when consent
-- does. Hand-written: Prisma's schema language cannot express a CHECK.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_ai_pantry_consent_at_check"
  CHECK ("ai_pantry_consent" = ("ai_pantry_consent_at" IS NOT NULL));
