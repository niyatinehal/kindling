import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * CLI-only configuration (migrate, db pull, db seed). The runtime client does
 * NOT read this file — it is constructed with the pooled URL in
 * src/db/prisma.ts. Migrations use DIRECT_URL because Supabase's pooler does
 * not support the statements a migration issues.
 *
 * shadowDatabaseUrl backs `prisma migrate diff --from-migrations`. Prisma 7
 * dropped the `--shadow-database-url` CLI flag from `migrate diff` — the
 * shadow database can only be configured here. It must point at a separate,
 * always-empty database: the schema engine replays every migration onto it
 * from scratch, which would destroy data in a database already in use.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    ...(process.env["DIRECT_URL"] !== undefined && { url: process.env["DIRECT_URL"] }),
    ...(process.env["SHADOW_DATABASE_URL"] !== undefined && {
      shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
    }),
  },
});
