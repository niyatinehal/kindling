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

  const existingFamily = await prisma.family.findFirst({
    where: { name: "Demo Family", deletedAt: null },
  });

  const family =
    existingFamily ??
    (await prisma.family.create({
      data: { name: "Demo Family", createdByUserId: admin.id },
    }));

  for (const [user, role] of [
    [admin, "admin"],
    [adult, "adult"],
  ] as const) {
    const membership = await prisma.familyMembership.findUnique({
      where: { familyId_userId: { familyId: family.id, userId: user.id } },
    });

    if (membership === null) {
      await prisma.familyMembership.create({
        data: { familyId: family.id, userId: user.id, role, joinedAt: new Date() },
      });
    }
  }

  return { familyId: family.id };
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
