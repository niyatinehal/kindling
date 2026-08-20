import { afterAll, describe, expect, it } from "@jest/globals";

import { createPrismaClient, disconnect } from "../../src/db/prisma.js";

const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);

/**
 * The database is reachable by two doors, and only one of them is this API.
 *
 * Supabase publishes every table in `public` through PostgREST, authenticated
 * by the anon key — a key that is embedded in the browser bundle by design and
 * therefore known to anyone who opens the site. Prisma creates its tables with
 * row level security OFF, and Supabase's default privileges grant the `anon`
 * role access to tables created by `postgres`, which is exactly how
 * `prisma migrate deploy` creates them. The result was that every profile,
 * every tracking log and every consent record could be read, edited and
 * deleted by anyone, without a session, from a browser console.
 *
 * Enabling RLS with no policies closes that door and leaves this one open:
 * Prisma connects as the table owner, and an owner bypasses RLS.
 *
 * This test is written against the catalogue rather than a fixed list of
 * tables on purpose. A list would still pass on the day somebody adds an
 * eleventh table and forgets — which is the only way this regresses.
 */
describe("row level security", () => {
  it("is enabled on every application table", async () => {
    const tables = await prisma.$queryRaw<{ table: string; enabled: boolean }[]>`
      SELECT c.relname AS "table", c.relrowsecurity AS enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        -- Prisma's own bookkeeping. It holds migration names and checksums,
        -- no user data, and it is written by the migration engine rather than
        -- by this schema — so it is left alone deliberately, not overlooked.
        AND c.relname <> '_prisma_migrations'
      ORDER BY c.relname
    `;

    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((row) => !row.enabled).map((row) => row.table)).toEqual([]);
  });
});

afterAll(async () => {
  await disconnect(prisma);
});
