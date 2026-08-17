import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { createPrismaClient, disconnect } from "../../src/db/prisma.js";
import { seed } from "../../prisma/seed.js";

const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);

/**
 * Records which emails the seed asked to provision, so the tests can assert the
 * seed only creates auth accounts for users it is actually creating. Returns a
 * plain UUID: this database has no `auth` schema, so no foreign key constrains
 * the value — which is exactly why the provisioner is injected rather than
 * calling Supabase from inside the seed.
 */
let provisioned: string[] = [];

/**
 * Records the id handed back for each email, so tests can assert a seeded
 * user's `authUserId` is the exact value the provisioner returned — not
 * merely something UUID-shaped, which a seed that bypassed the seam and
 * generated its own id inline would also produce.
 */
let provisionedIds = new Map<string, string>();

const fakeProvisioner = (email: string): Promise<string> => {
  provisioned.push(email);
  const id = randomUUID();
  provisionedIds.set(email, id);
  return Promise.resolve(id);
};

async function clearAll(): Promise<void> {
  await prisma.trackingLog.deleteMany();
  await prisma.visibilitySetting.deleteMany();
  await prisma.familyInvite.deleteMany();
  await prisma.workoutPlan.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.familyMembership.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(() => {
  provisioned = [];
  provisionedIds = new Map();
});

beforeAll(async () => {
  await clearAll();
});

afterAll(async () => {
  await disconnect(prisma);
});

describe("seed", () => {
  it("creates one family with two members", async () => {
    const { familyId } = await seed(prisma, fakeProvisioner);

    const family = await prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      include: { memberships: true },
    });

    expect(family.name).toBe("Demo Family");
    expect(family.memberships).toHaveLength(2);
    expect(family.memberships.map((m) => m.role).sort()).toEqual(["admin", "adult"]);
  });

  it("is idempotent — running twice does not duplicate", async () => {
    await seed(prisma, fakeProvisioner);
    await seed(prisma, fakeProvisioner);

    expect(await prisma.family.count()).toBe(1);
    expect(await prisma.user.count()).toBe(2);
    expect(await prisma.familyMembership.count()).toBe(2);
  });

  it("re-seeds successfully after the demo family is soft-deleted", async () => {
    const { familyId } = await seed(prisma, fakeProvisioner);

    // Mirrors the real failure mode: the family is soft-deleted while its
    // memberships stay `status = 'active'` — the partial unique index only
    // guards against the membership's own soft delete, not the family's.
    await prisma.family.update({
      where: { id: familyId },
      data: { deletedAt: new Date() },
    });

    const { familyId: secondFamilyId } = await seed(prisma, fakeProvisioner);

    // Re-seeding must revive the same family row rather than creating a
    // second one, because a second row would carry a new id and creating
    // fresh memberships against it would collide with the still-active
    // memberships left on the soft-deleted original (P2002).
    expect(secondFamilyId).toBe(familyId);
    expect(await prisma.family.count()).toBe(1);
    expect(await prisma.familyMembership.count()).toBe(2);

    const family = await prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      include: { memberships: true },
    });

    expect(family.deletedAt).toBeNull();
    expect(family.memberships).toHaveLength(2);
    expect(family.memberships.every((m) => m.status === "active" && m.deletedAt === null)).toBe(
      true,
    );
  });
  it("provisions exactly one auth user per demo member on a first run", async () => {
    await clearAll();
    provisioned = [];

    await seed(prisma, fakeProvisioner);

    // "admin" sorts before "adult" — 'm' < 'u'.
    expect(provisioned.sort()).toEqual(["admin@demo.test", "adult@demo.test"]);
  });

  it("does not provision again on a repeat run", async () => {
    await clearAll();
    provisioned = [];

    await seed(prisma, fakeProvisioner);

    // Prove the seam was actually exercised on the first run — otherwise a
    // seed that never calls the provisioner would satisfy the assertion
    // below for the wrong reason.
    expect(provisioned.sort()).toEqual(["admin@demo.test", "adult@demo.test"]);

    provisioned = [];
    await seed(prisma, fakeProvisioner);

    expect(provisioned).toEqual([]);
  });

  it("gives every seeded user the auth_user_id the provisioner returned", async () => {
    await clearAll();
    provisionedIds.clear();

    await seed(prisma, fakeProvisioner);

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(2);
    expect(provisionedIds.size).toBe(2);
    for (const user of users) {
      const { email } = user;
      if (email === null) {
        throw new Error("seeded demo user has no email");
      }
      expect(provisionedIds.get(email)).toBe(user.authUserId);
    }
  });
});
