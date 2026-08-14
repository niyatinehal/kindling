-- Fix: 20260813122912_domain_a_constraints guarded the auth.users FK with
--   IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth')
-- information_schema.schemata is privilege-filtered: it only lists schemas
-- the connecting role has some privilege on. A role that can see and alter
-- "public"."users" but has never been granted anything on "auth" would see
-- zero rows there even though the auth schema exists, so the guard would
-- silently skip the FK and nothing would notice.
--
-- pg_catalog.pg_namespace is a system catalog, not privilege-filtered by
-- visibility rules the way information_schema is — any role can see that a
-- schema named "auth" exists, even with zero privileges on it. This
-- migration does not touch the original file (its checksum is already
-- recorded in _prisma_migrations on both databases); instead it adds the
-- same constraint, guarded so it is a no-op wherever the constraint is
-- already present (the common case, since the original guard already
-- succeeded under the superuser role this project uses locally) and a
-- no-op wherever the auth schema still does not exist (the plain test
-- Postgres).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'auth')
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'users_auth_user_id_fkey'
     )
  THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_auth_user_id_fkey"
      FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users" ("id")
      ON DELETE SET NULL;
  END IF;
END $$;
