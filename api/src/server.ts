import { llmApiKey, loadEnv } from "./config/env.js";
import { createPrismaClient, disconnect, pingDatabase } from "./db/prisma.js";
import { createApp } from "./app.js";
import { createSupabaseVerifier } from "./auth/verifyToken.js";
import { createAnthropicLlmClient } from "./llm/anthropicClient.js";
import { disabledLlmClient } from "./llm/client.js";
import { createPlanGenerator } from "./workouts/planGenerator.js";

const env = loadEnv(process.env);
const prisma = createPrismaClient(env.DATABASE_URL);

const apiKey = llmApiKey(env);
if (env.LLM_ENABLED && apiKey === undefined) {
  // Said once at boot rather than silently: someone turned the feature on and
  // it is not on, which they will want to know before a user does.
  console.warn("LLM_ENABLED is set but LLM_API_KEY is not; AI pantry parsing is off");
}

const app = createApp({
  checkDatabase: () => pingDatabase(prisma),
  prisma,
  verify: createSupabaseVerifier(env.SUPABASE_URL),
  planGenerator: createPlanGenerator(env.WORKOUT_ENGINE),
  llm: apiKey === undefined ? disabledLlmClient : createAnthropicLlmClient({ apiKey }),
  // Spread rather than passed as possibly-undefined: with the variable unset
  // the key is absent, and `createApp` leaves the reporting route unmounted.
  ...(env.INTERNAL_REPORT_TOKEN === undefined
    ? {}
    : { internalReportToken: env.INTERNAL_REPORT_TOKEN }),
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
