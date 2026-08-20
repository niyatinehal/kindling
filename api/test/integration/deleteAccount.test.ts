import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import type { CryptoKey, JWK } from "jose";
import { randomUUID } from "node:crypto";
import request from "supertest";

import { createApp } from "../../src/app.js";
import { createTokenVerifier } from "../../src/auth/verifyToken.js";
import { createPrismaClient, disconnect } from "../../src/db/prisma.js";
import { rulesPlanGenerator } from "../../src/workouts/planGenerator.js";

const ISSUER = "http://127.0.0.1:54321/auth/v1";
const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);
let privateKey: CryptoKey;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  const jwk: JWK = {
    ...(await exportJWK(pair.publicKey)),
    kid: "test-key",
    alg: "ES256",
    use: "sig",
  };

  app = createApp({
    checkDatabase: () => Promise.resolve(),
    prisma,
    planGenerator: rulesPlanGenerator,
    verify: createTokenVerifier({
      issuer: ISSUER,
      audience: "authenticated",
      keys: createLocalJWKSet({ keys: [jwk] }),
    }),
  });

  await prisma.trackingLog.deleteMany();
  await prisma.visibilitySetting.deleteMany();
  await prisma.familyInvite.deleteMany();
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

const tokenFor = (authUserId: string): Promise<string> =>
  new SignJWT({ email: "", phone: "" })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuer(ISSUER)
    .setAudience("authenticated")
    .setSubject(authUserId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

/** A registered person with a profile, a plan and something logged. */
async function someoneWithData(email: string) {
  const authUserId = randomUUID();
  const user = await prisma.user.create({
    data: { displayName: "Meera", email, authUserId },
  });
  await prisma.consentRecord.create({
    data: {
      userId: user.id,
      grantedByUserId: user.id,
      consentType: "health_data",
      policyVersion: "2026-08-15",
    },
  });
  await prisma.profile.create({
    data: {
      userId: user.id,
      birthYear: 1963,
      goal: "general_fitness",
      level: "beginner",
      space: "small_room",
    },
  });
  const plan = await prisma.workoutPlan.create({
    data: { userId: user.id, status: "active", profileSnapshot: {}, generator: "rules_v1" },
  });
  await prisma.planExercise.create({
    data: {
      planId: plan.id,
      dayOfWeek: 1,
      position: 1,
      exerciseKey: "squat",
      sets: 3,
      reps: 10,
      restSeconds: 60,
    },
  });
  await prisma.trackingLog.create({
    data: { userId: user.id, type: "water", status: "logged", loggedFor: new Date(), value: 250 },
  });
  return { user, token: await tokenFor(authUserId) };
}

describe("DELETE /api/v1/auth/me", () => {
  /*
    Erasure has to mean erasure. A soft delete would leave every logged figure
    and every medical condition in the table it was already in, which is not
    what the privacy page promises and not what someone asking to be deleted
    means.
  */
  it("removes the account and everything logged against it", async () => {
    const { user, token } = await someoneWithData("meera@example.test");

    const response = await request(app)
      .delete("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.profile.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.trackingLog.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.workoutPlan.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.consentRecord.count({ where: { userId: user.id } })).toBe(0);
  });

  it("leaves everybody else's data untouched", async () => {
    const { token } = await someoneWithData("goes@example.test");
    const other = await someoneWithData("stays@example.test");

    await request(app).delete("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);

    expect(await prisma.user.findUnique({ where: { id: other.user.id } })).not.toBeNull();
    expect(await prisma.trackingLog.count({ where: { userId: other.user.id } })).toBe(1);
  });

  /*
    Deleting the only admin of a household with people still in it would leave
    them with a family nobody can administer — no invites, no dashboard, no way
    to appoint a replacement. Refusing is the honest answer, and it names what
    to do instead.
  */
  it("refuses while the caller is the last admin of a family with other members", async () => {
    const admin = await someoneWithData("admin@example.test");
    const member = await someoneWithData("member@example.test");
    const family = await prisma.family.create({
      data: { name: "Sharma", createdByUserId: admin.user.id },
    });
    await prisma.familyMembership.create({
      data: {
        familyId: family.id,
        userId: admin.user.id,
        role: "admin",
        status: "active",
        joinedAt: new Date(),
      },
    });
    await prisma.familyMembership.create({
      data: {
        familyId: family.id,
        userId: member.user.id,
        role: "adult",
        status: "active",
        joinedAt: new Date(),
      },
    });

    const response = await request(app)
      .delete("/api/v1/auth/me")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(response.status).toBe(409);
    expect((response.body as { error?: { code?: string } }).error?.code).toBe("FAMILY_NEEDS_ADMIN");
    expect(await prisma.user.findUnique({ where: { id: admin.user.id } })).not.toBeNull();
  });

  // The household exists to be shared. One with nobody left in it is not a
  // record worth keeping, and leaving it behind would block the delete anyway:
  // families.created_by_user_id is ON DELETE RESTRICT.
  it("takes the family with it when nobody else is left in it", async () => {
    const admin = await someoneWithData("solo@example.test");
    const family = await prisma.family.create({
      data: { name: "Solo", createdByUserId: admin.user.id },
    });
    await prisma.familyMembership.create({
      data: {
        familyId: family.id,
        userId: admin.user.id,
        role: "admin",
        status: "active",
        joinedAt: new Date(),
      },
    });

    const response = await request(app)
      .delete("/api/v1/auth/me")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(response.status).toBe(204);
    expect(await prisma.family.findUnique({ where: { id: family.id } })).toBeNull();
  });
});
