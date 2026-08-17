import { loadEnv } from "./config/env.js";
import { createPrismaClient, disconnect, pingDatabase } from "./db/prisma.js";
import { createApp } from "./app.js";
import { createSupabaseVerifier } from "./auth/verifyToken.js";
import { createPlanGenerator } from "./workouts/planGenerator.js";

const env = loadEnv(process.env);
const prisma = createPrismaClient(env.DATABASE_URL);

const app = createApp({
  checkDatabase: () => pingDatabase(prisma),
  prisma,
  verify: createSupabaseVerifier(env.SUPABASE_URL),
  planGenerator: createPlanGenerator(env.WORKOUT_ENGINE),
});

const server = app.listen(env.PORT, () => {
  console.log(`wellness-platform listening on http://localhost:${env.PORT}`);
});

/**
 * Close the HTTP server before the connection pool, so in-flight requests are
 * not cut off mid-query.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await disconnect(prisma);

  process.exit(0);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
