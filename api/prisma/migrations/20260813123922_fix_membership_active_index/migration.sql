-- Fix: the active-membership partial index must also respect soft delete.
-- Without "deleted_at" IS NULL, a membership that is soft-deleted while still
-- status = 'active' permanently occupies the user's single active-family
-- slot, blocking them from ever joining another family.
DROP INDEX "family_memberships_user_id_active_key";

CREATE UNIQUE INDEX "family_memberships_user_id_active_key"
  ON "family_memberships" ("user_id")
  WHERE "status" = 'active' AND "deleted_at" IS NULL;

-- Fix: set_updated_at() had no SET search_path, which Supabase's advisor
-- flags as function_search_path_mutable (a mutable search_path in a
-- SECURITY-relevant function is a hijacking vector). CREATE OR REPLACE keeps
-- the existing triggers wired to this function; they do not need recreating.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$;
