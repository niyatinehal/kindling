-- CreateTable
CREATE TABLE "error_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,
    "method" TEXT,
    "path" TEXT,
    "status" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,

    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_events_occurred_at_idx" ON "error_events"("occurred_at");

-- Every table in this schema carries row level security, and a new one is
-- exactly where that gets forgotten — which is why the integration suite reads
-- pg_class rather than a fixed list. Nothing outside this application has any
-- business reading a table of stack traces.
ALTER TABLE "error_events" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "error_events" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "error_events" FROM "authenticated";
  END IF;
END $$;

