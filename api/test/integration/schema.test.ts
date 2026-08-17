import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

import { Prisma } from "../../generated/prisma/client.js";
import { createPrismaClient, disconnect } from "../../src/db/prisma.js";
import { randomUUID } from "node:crypto";

const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);

async function createUser(email: string) {
  // `auth_user_id` is NOT NULL, and on the Supabase stack it is foreign-keyed
  // into `auth.users`. These tests run against plain Postgres, where that guard
  // skips the constraint, so a generated UUID is both valid and honest here —
  // these are schema-constraint tests, not auth tests.
  return prisma.user.create({
    data: { displayName: "Test", email, authUserId: randomUUID() },
  });
}

/**
 * Bare `.rejects.toThrow()` passes on any thrown error, including a
 * programming mistake elsewhere in the test that throws for an unrelated
 * reason. Asserting the Prisma error code (P2002, unique constraint
 * violation) and the specific field the underlying partial index guards
 * keeps these tests honest about which invariant they exercise.
 */
async function expectUniqueConstraintViolation(
  promise: Promise<unknown>,
  field: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const knownError = error as Prisma.PrismaClientKnownRequestError;
    expect(knownError.code).toBe("P2002");
    expect(knownError.message).toContain(`\`${field}\``);
    return;
  }
  throw new Error("expected the promise to reject with a unique constraint violation");
}

beforeAll(async () => {
  await prisma.workoutPlan.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.familyMembership.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await disconnect(prisma);
});

describe("hand-written constraints", () => {
  it("rejects a second active membership for the same user", async () => {
    const user = await createUser("one@example.test");
    const family = await prisma.family.create({
      data: { name: "First", createdByUserId: user.id },
    });
    const other = await prisma.family.create({
      data: { name: "Second", createdByUserId: user.id },
    });

    await prisma.familyMembership.create({
      data: { familyId: family.id, userId: user.id, role: "admin", joinedAt: new Date() },
    });

    await expectUniqueConstraintViolation(
      prisma.familyMembership.create({
        data: { familyId: other.id, userId: user.id, role: "adult", joinedAt: new Date() },
      }),
      "user_id",
    );
  });

  it("allows a second membership once the first is not active", async () => {
    const user = await createUser("two@example.test");
    const first = await prisma.family.create({
      data: { name: "Old", createdByUserId: user.id },
    });
    const second = await prisma.family.create({
      data: { name: "New", createdByUserId: user.id },
    });

    const membership = await prisma.familyMembership.create({
      data: { familyId: first.id, userId: user.id, role: "adult", joinedAt: new Date() },
    });
    await prisma.familyMembership.update({
      where: { id: membership.id },
      data: { status: "left" },
    });

    await expect(
      prisma.familyMembership.create({
        data: { familyId: second.id, userId: user.id, role: "adult", joinedAt: new Date() },
      }),
    ).resolves.toBeDefined();
  });

  it("frees the active-family slot once the membership is soft-deleted", async () => {
    const user = await createUser("three@example.test");
    const first = await prisma.family.create({
      data: { name: "Original", createdByUserId: user.id },
    });
    const second = await prisma.family.create({
      data: { name: "Replacement", createdByUserId: user.id },
    });

    const membership = await prisma.familyMembership.create({
      data: { familyId: first.id, userId: user.id, role: "adult", joinedAt: new Date() },
    });

    await expectUniqueConstraintViolation(
      prisma.familyMembership.create({
        data: { familyId: second.id, userId: user.id, role: "adult", joinedAt: new Date() },
      }),
      "user_id",
    );

    await prisma.familyMembership.update({
      where: { id: membership.id },
      data: { deletedAt: new Date() },
    });

    await expect(
      prisma.familyMembership.create({
        data: { familyId: second.id, userId: user.id, role: "adult", joinedAt: new Date() },
      }),
    ).resolves.toBeDefined();
  });

  it("frees an email address once the row is soft-deleted", async () => {
    const user = await createUser("recycle@example.test");

    await expectUniqueConstraintViolation(createUser("recycle@example.test"), "email");

    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    await expect(createUser("recycle@example.test")).resolves.toBeDefined();
  });

  it("bumps updated_at on the database side", async () => {
    const user = await createUser("touch@example.test");

    // Both reads must follow a raw `$executeRaw` update so this compares the
    // database clock to itself. `updated_at` right after `create()` was
    // written by Prisma's client-side `@updatedAt` (the app server's clock),
    // while the trigger writes `now()` (the database server's clock) — those
    // two clocks are not guaranteed to agree, so comparing one raw-updated
    // timestamp to the other is the only way to isolate what the trigger
    // itself does.
    await prisma.$executeRaw`UPDATE users SET display_name = 'Raw One' WHERE id = ${user.id}::uuid`;
    const rowsBefore = await prisma.$queryRaw<{ updated_at: Date }[]>`
      SELECT updated_at FROM users WHERE id = ${user.id}::uuid
    `;
    const before = rowsBefore[0]?.updated_at;
    if (before === undefined) {
      throw new Error("expected the user row to exist");
    }

    await prisma.$executeRaw`UPDATE users SET display_name = 'Raw Two' WHERE id = ${user.id}::uuid`;
    const rowsAfter = await prisma.$queryRaw<{ updated_at: Date }[]>`
      SELECT updated_at FROM users WHERE id = ${user.id}::uuid
    `;
    const after = rowsAfter[0]?.updated_at;
    if (after === undefined) {
      throw new Error("expected the user row to exist");
    }

    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});
