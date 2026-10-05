-- CreateEnum
CREATE TYPE "LlmCallOutcome" AS ENUM ('ok', 'timeout', 'provider_error', 'invalid_output', 'cache_hit', 'breaker_open', 'rate_limited');

-- CreateTable
CREATE TABLE "pantry_parse_cache" (
    "text_hash" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "recognised" TEXT[],
    "unrecognised" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pantry_parse_cache_pkey" PRIMARY KEY ("text_hash")
);

-- CreateTable
CREATE TABLE "llm_calls" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "outcome" "LlmCallOutcome" NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER NOT NULL,
    "cost_micro_usd" INTEGER,
    "request_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pantry_parse_cache_expires_at_idx" ON "pantry_parse_cache"("expires_at");

-- CreateIndex
CREATE INDEX "llm_calls_user_id_created_at_idx" ON "llm_calls"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Neither table holds pantry text: the cache is keyed by a hash and stores
-- only ingredient keys, and llm_calls stores numbers and outcomes. Both are
-- still nobody's business outside this application, so they get the same
-- closed door as every other table (see 20260820120000_enable_row_level_security).
ALTER TABLE "pantry_parse_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "llm_calls" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "pantry_parse_cache" FROM "anon";
    REVOKE ALL ON TABLE "llm_calls" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "pantry_parse_cache" FROM "authenticated";
    REVOKE ALL ON TABLE "llm_calls" FROM "authenticated";
  END IF;
END $$;
