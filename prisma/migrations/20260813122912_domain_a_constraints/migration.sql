-- 1. One active family per user. Prisma's DSL cannot express a partial index,
--    and this is the invariant every family dashboard assumes.
CREATE UNIQUE INDEX "family_memberships_user_id_active_key"
  ON "family_memberships" ("user_id")
  WHERE "status" = 'active';

-- 2. Unique email/phone among live rows only. A plain unique index combined
--    with soft delete would permanently burn an address on account deletion.
CREATE UNIQUE INDEX "users_email_live_key"
  ON "users" ("email")
  WHERE "deleted_at" IS NULL AND "email" IS NOT NULL;

CREATE UNIQUE INDEX "users_phone_live_key"
  ON "users" ("phone")
  WHERE "deleted_at" IS NULL AND "phone" IS NOT NULL;

-- 3. updated_at maintained by the database. Prisma's @updatedAt is
--    client-side only, so any raw SQL write would otherwise skip it.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER families_set_updated_at
  BEFORE UPDATE ON "families"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER family_memberships_set_updated_at
  BEFORE UPDATE ON "family_memberships"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Link to Supabase Auth. Guarded because the auth schema exists on the
--    Supabase stack but not in a plain Postgres test container.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_auth_user_id_fkey"
      FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users" ("id")
      ON DELETE SET NULL;
  END IF;
END $$;
