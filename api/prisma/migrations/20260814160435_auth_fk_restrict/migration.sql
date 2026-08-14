-- Fix: 20260813122912_domain_a_constraints (carried forward by the guard in
-- 20260813185303_auth_fk_pg_catalog_guard) added
--   FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users" ("id") ON DELETE SET NULL
-- but 20260814132100_consent_and_auth_user_id_required made "auth_user_id"
-- NOT NULL. Those two are mutually incompatible: deleting an `auth.users`
-- row makes Postgres attempt `SET NULL` on a NOT NULL column, which fails
-- with 23502 (not_null_violation) for every domain user, unconditionally.
-- That is not the intended failure — it should fail because a domain row
-- still references the auth account (a foreign key violation), not because
-- of a contradiction in the schema.
--
-- The fix is ON DELETE RESTRICT: it keeps D4's guarantee that every domain
-- user is linked to an auth account, and it turns account deletion into an
-- explicit application flow (soft-delete or anonymise the domain user, then
-- remove the auth account) rather than a silent SET NULL that can never
-- succeed. CASCADE is wrong here too — it would hard-delete health data
-- this schema deliberately soft-deletes instead, and `consent_records` has
-- its own ON DELETE RESTRICT foreign key to `users`, so the cascade would
-- fail regardless.
--
-- Guarded exactly like 20260813185303_auth_fk_pg_catalog_guard: this reads
-- pg_catalog.pg_namespace, not information_schema.schemata, because the
-- latter is privilege-filtered and would let the guard silently skip a
-- role that has never been granted anything on `auth`. On the plain
-- Postgres used for tests there is no `auth` schema and no such constraint,
-- so this migration is a no-op there, same as the one it corrects.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'auth')
  THEN
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'users_auth_user_id_fkey'
    )
    THEN
      ALTER TABLE "users" DROP CONSTRAINT "users_auth_user_id_fkey";
    END IF;

    ALTER TABLE "users"
      ADD CONSTRAINT "users_auth_user_id_fkey"
      FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users" ("id")
      ON DELETE RESTRICT;
  END IF;
END $$;
