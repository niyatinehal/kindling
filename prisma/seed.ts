import { loadEnv } from "../src/config/env.js";
import { createPrismaClient, disconnect } from "../src/db/prisma.js";
import type { PrismaClient } from "../generated/prisma/client.js";

const ADMIN_EMAIL = "admin@demo.test";
const ADULT_EMAIL = "adult@demo.test";

/**
 * Creates a Supabase auth account and returns its id.
 *
 * This is injected rather than called directly because `users.auth_user_id` is
 * NOT NULL and, on the Supabase stack, foreign-keyed into `auth.users` — so the
 * seed cannot invent a value there. Integration tests run against plain
 * Postgres, which has no `auth` schema and therefore no such foreign key, so
 * they pass an implementation returning a generated UUID. The seed itself never
 * inspects its environment.
 */
export type AuthUserProvisioner = (email: string) => Promise<string>;

/**
 * Idempotent by design: re-running must not duplicate rows, because the
 * roadmap's definition of done is that a fresh clone plus migrate plus seed
 * produces identical data every time. Keyed on the demo email addresses.
 */
export async function seed(
  prisma: PrismaClient,
  provisionAuthUser: AuthUserProvisioner,
): Promise<{ familyId: string }> {
  const admin = await ensureUser(prisma, provisionAuthUser, ADMIN_EMAIL, "Demo Admin");
  const adult = await ensureUser(prisma, provisionAuthUser, ADULT_EMAIL, "Demo Adult");

  const family = await ensureFamily(prisma, "Demo Family", admin.id);

  for (const [user, role] of [
    [admin, "admin"],
    [adult, "adult"],
  ] as const) {
    await ensureMembership(prisma, family.id, user.id, role);
  }

  return { familyId: family.id };
}

/**
 * The family lookup must not filter on `deleted_at IS NULL`: if the demo
 * family was soft-deleted (e.g. by hand while poking at the API) and a
 * naive lookup ignored it, re-seeding would create a second family row
 * with a new id. The user's original memberships would still point at the
 * old (soft-deleted) family and would still be `status = 'active'`, so
 * creating fresh memberships against the new family id would collide with
 * `family_memberships_user_id_active_key` (P2002) — the partial index is
 * scoped to the membership's own soft delete, not the family's. Finding
 * and reviving the same row keeps the family id — and therefore the
 * existing memberships — stable, so no such collision is possible.
 */
async function ensureFamily(prisma: PrismaClient, name: string, createdByUserId: string) {
  const existing = await prisma.family.findFirst({ where: { name } });

  if (existing === null) {
    return prisma.family.create({ data: { name, createdByUserId } });
  }

  if (existing.deletedAt !== null) {
    return prisma.family.update({ where: { id: existing.id }, data: { deletedAt: null } });
  }

  return existing;
}

/**
 * `(family_id, user_id)` is a plain (non-partial) unique index, so at most
 * one membership row can ever exist for this family/user pair regardless of
 * soft delete or status. That means reviving it in place — rather than
 * creating a second row — is not just idempotent, it is the only option:
 * a `create` here would hit that unique constraint whenever a prior
 * membership (soft-deleted, or left/removed) already exists.
 */
async function ensureMembership(
  prisma: PrismaClient,
  familyId: string,
  userId: string,
  role: "admin" | "adult",
) {
  const existing = await prisma.familyMembership.findUnique({
    where: { familyId_userId: { familyId, userId } },
  });

  if (existing === null) {
    await prisma.familyMembership.create({
      data: { familyId, userId, role, joinedAt: new Date() },
    });
    return;
  }

  if (existing.deletedAt !== null || existing.status !== "active") {
    await prisma.familyMembership.update({
      where: { id: existing.id },
      data: { deletedAt: null, status: "active" },
    });
  }
}

/**
 * `email` has no Prisma-level @unique — uniqueness is a partial index scoped to
 * live rows — so `upsert` is not available here. Find-then-create is the
 * correct shape, and the demo emails are the idempotency key.
 */
async function ensureUser(
  prisma: PrismaClient,
  provisionAuthUser: AuthUserProvisioner,
  email: string,
  displayName: string,
) {
  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });

  if (existing !== null) {
    return existing;
  }

  // Provisioned only on the create path, so a repeat seed creates no further
  // auth accounts — the tests assert exactly that.
  const authUserId = await provisionAuthUser(email);

  return prisma.user.create({ data: { displayName, email, locale: "en", authUserId } });
}

/**
 * Calls Supabase's admin API to create a real auth account. Used only by
 * `prisma db seed` against the local stack — never on a request path, which is
 * why the service-role key is read here and nowhere else.
 *
 * Tolerates the account already existing: `migrate reset` drops the `public`
 * schema and re-runs this seed, but `auth.users` is owned by the Supabase
 * stack and survives the reset. Without this, the second `migrate reset` in a
 * row dies here with a 422, because the demo email already has an auth
 * account from the first run.
 */
export function createSupabaseAuthUserProvisioner(
  supabaseUrl: string,
  serviceRoleKey: string,
): AuthUserProvisioner {
  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  /**
   * GoTrue's admin list-users endpoint silently ignores an `email` query
   * param — it returns every user, unfiltered, verified against a live local
   * stack — but it does honor `filter`, which does a server-side substring
   * match. Substring matching can still return near-misses (one address
   * containing another), so the exact match is re-checked client-side rather
   * than trusting the first row back.
   */
  async function findExistingAuthUserId(email: string): Promise<string | undefined> {
    const response = await fetch(
      `${baseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
      { headers },
    );

    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as { users?: { id?: string; email?: string }[] };
    return body.users?.find((user) => user.email === email)?.id;
  }

  return async function provision(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        password: "demo-password-change-me",
        email_confirm: true,
      }),
    });

    if (response.ok) {
      const body = (await response.json()) as { id?: string };
      if (body.id === undefined) {
        throw new Error("auth user creation returned no id");
      }
      return body.id;
    }

    if (response.status === 422) {
      const errorBody = (await response.json().catch(() => undefined)) as
        { error_code?: string } | undefined;

      if (errorBody?.error_code === "email_exists") {
        const existingId = await findExistingAuthUserId(email);
        if (existingId !== undefined) {
          return existingId;
        }
      }
    }

    // Deliberately does not include the response body: it can echo the
    // service-role key back in an error envelope.
    throw new Error(`could not provision an auth user (status ${String(response.status)})`);
  };
}

// `prisma db seed` executes this file directly.
if (process.argv[1]?.endsWith("seed.ts") === true) {
  const env = loadEnv(process.env);

  if (env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to seed: the demo users need real Supabase auth accounts. Copy SERVICE_ROLE_KEY from `npx supabase status`.",
    );
  }

  const prisma = createPrismaClient(env.DIRECT_URL);
  try {
    const { familyId } = await seed(
      prisma,
      createSupabaseAuthUserProvisioner(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    );
    console.log(`seeded demo family ${familyId}`);
  } finally {
    await disconnect(prisma);
  }
}
