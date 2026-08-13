import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

import { createPrismaClient, disconnect } from "../../src/db/prisma.js";
import { seed } from "../../prisma/seed.js";

const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);

beforeAll(async () => {
  await prisma.familyMembership.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await disconnect(prisma);
});

describe("seed", () => {
  it("creates one family with two members", async () => {
    const { familyId } = await seed(prisma);

    const family = await prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      include: { memberships: true },
    });

    expect(family.name).toBe("Demo Family");
    expect(family.memberships).toHaveLength(2);
    expect(family.memberships.map((m) => m.role).sort()).toEqual(["admin", "adult"]);
  });

  it("is idempotent — running twice does not duplicate", async () => {
    await seed(prisma);
    await seed(prisma);

    expect(await prisma.family.count()).toBe(1);
    expect(await prisma.user.count()).toBe(2);
    expect(await prisma.familyMembership.count()).toBe(2);
  });
});
