import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

import { createPrismaClient, disconnect } from "../../src/db/prisma.js";

const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);

async function createUser(email: string) {
  return prisma.user.create({ data: { displayName: "Test", email } });
}

beforeAll(async () => {
  await prisma.familyMembership.deleteMany();
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

    await expect(
      prisma.familyMembership.create({
        data: { familyId: other.id, userId: user.id, role: "adult", joinedAt: new Date() },
      }),
    ).rejects.toThrow();
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

    await expect(
      prisma.familyMembership.create({
        data: { familyId: second.id, userId: user.id, role: "adult", joinedAt: new Date() },
      }),
    ).rejects.toThrow();

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

    await expect(createUser("recycle@example.test")).rejects.toThrow();

    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    await expect(createUser("recycle@example.test")).resolves.toBeDefined();
  });

  it("bumps updated_at on the database side", async () => {
    const user = await createUser("touch@example.test");

    const rowsBefore = await prisma.$queryRaw<{ updated_at: Date }[]>`
      SELECT updated_at FROM users WHERE id = ${user.id}::uuid
    `;
    const before = rowsBefore[0]?.updated_at;
    if (before === undefined) {
      throw new Error("expected the user row to exist");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));

    await prisma.$executeRaw`UPDATE users SET display_name = 'Raw' WHERE id = ${user.id}::uuid`;

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
