-- CreateTable
CREATE TABLE "dish_explanation_cache" (
    "cache_key" TEXT NOT NULL,
    "generator" TEXT NOT NULL,
    "recipe_key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dish_explanation_cache_pkey" PRIMARY KEY ("cache_key")
);

-- CreateIndex
CREATE INDEX "dish_explanation_cache_expires_at_idx" ON "dish_explanation_cache"("expires_at");

-- No user data, but closed to everything outside this application like every
-- other table (see 20260820120000_enable_row_level_security).
ALTER TABLE "dish_explanation_cache" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "dish_explanation_cache" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "dish_explanation_cache" FROM "authenticated";
  END IF;
END $$;
