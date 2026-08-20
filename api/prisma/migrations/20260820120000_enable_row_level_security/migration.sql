-- Closes the second door onto this database.
--
-- Supabase publishes every table in `public` through PostgREST, authenticated
-- by the anon key. That key is embedded in the browser bundle by design
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY), so it is known to anyone who opens the
-- site. Prisma creates tables with row level security OFF, and Supabase's
-- default privileges grant `anon` and `authenticated` access to tables created
-- by the `postgres` role — which is exactly how `prisma migrate deploy`
-- creates them.
--
-- Verified against a running stack before this migration existed: with nothing
-- but the anon key, GET /rest/v1/profiles returned birth years, weights and
-- goals; users returned emails and phone numbers; PATCH and DELETE both
-- answered 204. Health data belonging to families, readable and writable by
-- anyone, without a session.
--
-- Nothing in this application uses PostgREST. The web app talks to Express,
-- which talks to Prisma, which authenticates every request through a verified
-- ES256 token. So the fix is not a policy that reimplements that check in SQL
-- — it is to shut the unused door completely.
--
-- Enabling RLS with NO policies denies every role that RLS applies to. It does
-- not affect this application: Prisma connects as the table owner, and an
-- owner bypasses RLS unless FORCE ROW LEVEL SECURITY is set, which it
-- deliberately is not.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "families" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workout_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_exercises" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visibility_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tracking_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_records" ENABLE ROW LEVEL SECURITY;

-- Belt and braces, and the two are not redundant: RLS decides row visibility,
-- the GRANT decides whether the role may address the table at all. Removing
-- the grant means a future migration that forgets RLS on a new table still
-- does not expose the existing ones, and it removes them from PostgREST's
-- generated schema entirely rather than leaving them present-but-empty.
--
-- Guarded the same way and for the same reason as
-- 20260813185303_auth_fk_pg_catalog_guard: these roles exist on Supabase and
-- not on the plain Postgres the integration tests run against, and an
-- unguarded REVOKE against a missing role aborts the migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon";
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "anon";
    ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "authenticated";
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "authenticated";
    ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";
  END IF;
END $$;
