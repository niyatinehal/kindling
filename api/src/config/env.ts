import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  // Pooled connection — used by the runtime driver adapter.
  DATABASE_URL: z.url(),
  // Direct connection — used by the Prisma CLI for migrations. See prisma.config.ts.
  DIRECT_URL: z.url(),
  // Base URL of the Supabase project. The JWT issuer and JWKS endpoint are
  // derived from it, so it must not carry a trailing slash.
  SUPABASE_URL: z.url(),
  // Service-role key. Needed ONLY by the seed's auth-user provisioner; the
  // request path never uses it, which is why it is optional here.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  // Which workout plan engine to run. `rules` is deterministic, free, and needs
  // no credentials, so it is the default rather than a fallback — see
  // src/workouts/planGenerator.ts. An LLM-backed engine would be a new value
  // here, not a change to the calling code.
  WORKOUT_ENGINE: z.enum(["rules"]).default("rules"),
  // Shared secret the web app presents when reporting a failure it handled
  // itself — a quota-exhausted sign-in email, say, which never reaches this
  // service's error handler because it never reaches this service. Optional
  // on purpose: unset, the reporting route is not mounted at all, so a
  // deployment without one has no endpoint rather than an open one.
  INTERNAL_REPORT_TOKEN: z.string().min(16).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables, failing fast at boot rather than on first
 * query. Error messages name the offending variable but never echo its value —
 * these strings reach logs, and connection strings contain passwords.
 */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }

  return result.data;
}
