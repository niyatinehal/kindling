import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * CLI-only configuration (migrate, db pull, db seed). The runtime client does
 * NOT read this file — it is constructed with the pooled URL in
 * src/db/prisma.ts. Migrations use DIRECT_URL because Supabase's pooler does
 * not support the statements a migration issues.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    ...(process.env["DIRECT_URL"] !== undefined && { url: process.env["DIRECT_URL"] }),
  },
});
