import { loadEnv } from "../src/config/env.js";
import { createPrismaClient, disconnect } from "../src/db/prisma.js";
import type { PrismaClient } from "../generated/prisma/client.js";

const ADMIN_EMAIL = "admin@demo.test";
const ADULT_EMAIL = "adult@demo.test";

/**
 * Idempotent by design: re-running must not duplicate rows, because the
 * roadmap's definition of done is that a fresh clone plus migrate plus seed
 * produces identical data every time. Keyed on the demo email addresses.
 */
export async function seed(prisma: PrismaClient): Promise<{ familyId: string }> {
  const admin = await ensureUser(prisma, ADMIN_EMAIL, "Demo Admin");
  const adult = await ensureUser(prisma, ADULT_EMAIL, "Demo Adult");

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
async function ensureUser(prisma: PrismaClient, email: string, displayName: string) {
  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });

  if (existing !== null) {
    return existing;
  }

  return prisma.user.create({ data: { displayName, email, locale: "en" } });
}

// `prisma db seed` executes this file directly.
if (process.argv[1]?.endsWith("seed.ts") === true) {
  const env = loadEnv(process.env);
  const prisma = createPrismaClient(env.DIRECT_URL);
  try {
    const { familyId } = await seed(prisma);
    console.log(`seeded demo family ${familyId}`);
  } finally {
    await disconnect(prisma);
  }
}
