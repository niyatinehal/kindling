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

const registeredUser = async (): Promise<string> => {
  const token = await tokenFor(randomUUID());
  await request(app)
    .post("/api/v1/auth/register")
    .set("Authorization", `Bearer ${token}`)
    .send({
      display_name: "Ramesh",
      locale: "en",
      consents: [{ consent_type: "health_data", policy_version: "2026-08-14" }],
    });
  return token;
};

/** Ramesh's profile — PRD persona 3. */
const withProfile = async (token: string, overrides: Record<string, unknown> = {}) => {
  await request(app)
    .put("/api/v1/profiles/me")
    .set("Authorization", `Bearer ${token}`)
    .send({
      birth_year: 1963,
      goal: "general_fitness",
      level: "beginner",
      space: "small_room",
      equipment: ["resistance_band", "yoga_mat"],
      injuries: ["knee"],
      conditions: ["arthritis", "type_2_diabetes"],
      ...overrides,
    });
};

type ErrorBody = { error?: { code?: string } };
type PlanBody = {
  plan?: {
    id?: string;
    generator?: string;
    days?: { day_of_week: number; exercises: { exercise_key: string }[] }[];
    profile_snapshot?: Record<string, unknown>;
  } | null;
};

describe("GET /api/v1/plans/current", () => {
  it("answers 200 with a null plan before one is generated", async () => {
    const token = await registeredUser();

    const response = await request(app)
      .get("/api/v1/plans/current")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect((response.body as PlanBody).plan).toBeNull();
  });

  it("returns 401 without a token", async () => {
    const response = await request(app).get("/api/v1/plans/current");

    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/plans", () => {
  // The seam this slice adds to the journey: registered, but no intake yet.
  it("refuses with PROFILE_REQUIRED when there is no profile", async () => {
    const token = await registeredUser();

    const response = await request(app)
      .post("/api/v1/plans")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error?.code).toBe("PROFILE_REQUIRED");
    expect(await prisma.workoutPlan.count()).toBe(0);
  });

  it("generates a plan with days and exercises, stamped with the generator", async () => {
    const token = await registeredUser();
    await withProfile(token);

    const response = await request(app)
      .post("/api/v1/plans")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(201);
    const plan = (response.body as PlanBody).plan;
    expect(plan?.generator).toBe("rules@1");
    expect(plan?.days?.length).toBe(3); // beginner
    expect(plan?.days?.[0]?.exercises.length).toBeGreaterThan(0);
  });

  // Safety, end to end through the real HTTP path rather than the pure function.
  it("leaves high-impact work out of a plan for a knee and arthritis profile", async () => {
    const token = await registeredUser();
    await withProfile(token);

    const response = await request(app)
      .post("/api/v1/plans")
      .set("Authorization", `Bearer ${token}`);

    const keys = ((response.body as PlanBody).plan?.days ?? []).flatMap((day) =>
      day.exercises.map((exercise) => exercise.exercise_key),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const banned of ["jumping_jacks", "burpee", "high_knees", "jump_rope"]) {
      expect(keys).not.toContain(banned);
    }
  });

  // The plan has to stay explainable after the profile moves on.
  it("snapshots the profile onto the plan, with the exclusions that were applied", async () => {
    const token = await registeredUser();
    await withProfile(token);

    const response = await request(app)
      .post("/api/v1/plans")
      .set("Authorization", `Bearer ${token}`);

    const snapshot = (response.body as PlanBody).plan?.profile_snapshot;
    expect(snapshot).toMatchObject({ birth_year: 1963, level: "beginner" });
    expect(snapshot?.["applied_exclusions"]).toContain("knee");
  });

  // Regeneration must never leave two active plans, or none.
  it("supersedes the previous plan rather than leaving two active", async () => {
    const token = await registeredUser();
    await withProfile(token);

    await request(app).post("/api/v1/plans").set("Authorization", `Bearer ${token}`);
    await request(app).post("/api/v1/plans").set("Authorization", `Bearer ${token}`);

    expect(await prisma.workoutPlan.count()).toBe(2);
    expect(await prisma.workoutPlan.count({ where: { status: "active" } })).toBe(1);
    expect(await prisma.workoutPlan.count({ where: { status: "superseded" } })).toBe(1);
  });

  it("serves the newly generated plan from /current", async () => {
    const token = await registeredUser();
    await withProfile(token);
    const created = await request(app)
      .post("/api/v1/plans")
      .set("Authorization", `Bearer ${token}`);

    const current = await request(app)
      .get("/api/v1/plans/current")
      .set("Authorization", `Bearer ${token}`);

    expect(current.status).toBe(200);
    expect((current.body as PlanBody).plan?.id).toBe((created.body as PlanBody).plan?.id);
  });

  it("reflects a changed profile in the next plan", async () => {
    const token = await registeredUser();
    await withProfile(token, { level: "beginner" });
    const first = await request(app).post("/api/v1/plans").set("Authorization", `Bearer ${token}`);
    expect((first.body as PlanBody).plan?.days?.length).toBe(3);

    await withProfile(token, { level: "advanced", birth_year: 1996, injuries: [], conditions: [] });
    const second = await request(app).post("/api/v1/plans").set("Authorization", `Bearer ${token}`);

    expect((second.body as PlanBody).plan?.days?.length).toBe(5);
  });

  it("returns 401 without a token", async () => {
    const response = await request(app).post("/api/v1/plans");

    expect(response.status).toBe(401);
  });

  it("returns 403 REGISTRATION_REQUIRED for a token with no domain user", async () => {
    const token = await tokenFor(randomUUID());

    const response = await request(app)
      .post("/api/v1/plans")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error?.code).toBe("REGISTRATION_REQUIRED");
  });
});
