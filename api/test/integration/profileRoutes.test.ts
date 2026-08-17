import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import type { CryptoKey, JWK } from "jose";
import { randomUUID } from "node:crypto";
import request from "supertest";

import { createApp } from "../../src/app.js";
import { createTokenVerifier } from "../../src/auth/verifyToken.js";
import { createPrismaClient, disconnect } from "../../src/db/prisma.js";

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
    verify: createTokenVerifier({
      issuer: ISSUER,
      audience: "authenticated",
      keys: createLocalJWKSet({ keys: [jwk] }),
    }),
  });

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

/** Registers a domain user and returns a token that resolves to it. */
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

const validProfile = {
  birth_year: 1963,
  sex: "male",
  height_cm: 170,
  weight_kg: 78.5,
  goal: "general_fitness",
  level: "beginner",
  space: "small_room",
  equipment: ["resistance_band", "yoga_mat"],
  injuries: ["knee"],
  conditions: ["arthritis", "type_2_diabetes"],
  dietary: ["vegetarian"],
  notes: "knee aches on stairs",
};

type ErrorBody = { error?: { code?: string } };
type ProfileBody = { profile?: Record<string, unknown> | null };

describe("GET /api/v1/profiles/me", () => {
  // Having no profile is a normal state, not a fault: intake is an invitation,
  // so /home must be able to ask "do you have one?" without handling an error.
  it("answers 200 with a null profile before intake", async () => {
    const token = await registeredUser();

    const response = await request(app)
      .get("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect((response.body as ProfileBody).profile).toBeNull();
  });

  it("returns the profile once saved, with age derived", async () => {
    const token = await registeredUser();
    await request(app)
      .put("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send(validProfile);

    const response = await request(app)
      .get("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect((response.body as ProfileBody).profile).toMatchObject({
      birth_year: 1963,
      goal: "general_fitness",
      conditions: ["arthritis", "type_2_diabetes"],
      weight_kg: 78.5,
    });
    expect((response.body as ProfileBody).profile?.["age_years"]).toBeGreaterThan(60);
  });

  it("returns 401 without a token", async () => {
    const response = await request(app).get("/api/v1/profiles/me");

    expect(response.status).toBe(401);
    expect((response.body as ErrorBody).error?.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 REGISTRATION_REQUIRED for a token with no domain user", async () => {
    const token = await tokenFor(randomUUID());

    const response = await request(app)
      .get("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error?.code).toBe("REGISTRATION_REQUIRED");
  });
});

describe("PUT /api/v1/profiles/me", () => {
  it("creates the profile and echoes it back", async () => {
    const token = await registeredUser();

    const response = await request(app)
      .put("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send(validProfile);

    expect(response.status).toBe(200);
    expect((response.body as ProfileBody).profile).toMatchObject({ level: "beginner" });
    expect(await prisma.profile.count()).toBe(1);
  });

  // The wizard can submit twice — a double tap, a retried request — and must
  // leave one row, not two.
  it("replaces rather than duplicating on a second submit", async () => {
    const token = await registeredUser();
    await request(app)
      .put("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send(validProfile);

    const response = await request(app)
      .put("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validProfile, level: "intermediate" });

    expect(response.status).toBe(200);
    expect((response.body as ProfileBody).profile).toMatchObject({ level: "intermediate" });
    expect(await prisma.profile.count()).toBe(1);
  });

  // PUT is a full replace, so a cleared measurement has to actually clear. An
  // absent key that left the old value in place would make deleting a weight
  // impossible.
  it("clears an optional measurement when it comes back null", async () => {
    const token = await registeredUser();
    await request(app)
      .put("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send(validProfile);

    const response = await request(app)
      .put("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validProfile, weight_kg: null, notes: null });

    expect(response.status).toBe(200);
    expect((response.body as ProfileBody).profile?.["weight_kg"]).toBeNull();
    expect((response.body as ProfileBody).profile?.["notes"]).toBeNull();
  });

  // `["none"]` means "I own no equipment"; `[]` means the question was never
  // answered. Only the first can safely produce a plan.
  it("rejects an empty equipment array but accepts [none]", async () => {
    const token = await registeredUser();

    const rejected = await request(app)
      .put("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validProfile, equipment: [] });

    expect(rejected.status).toBe(400);
    expect((rejected.body as ErrorBody).error?.code).toBe("VALIDATION_FAILED");

    const accepted = await request(app)
      .put("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validProfile, equipment: ["none"] });

    expect(accepted.status).toBe(200);
  });

  it("rejects a birth year in the future", async () => {
    const token = await registeredUser();

    const response = await request(app)
      .put("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validProfile, birth_year: new Date().getUTCFullYear() + 1 });

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error?.code).toBe("VALIDATION_FAILED");
  });

  it("rejects an unknown medical condition rather than storing it", async () => {
    const token = await registeredUser();

    const response = await request(app)
      .put("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validProfile, conditions: ["not_a_real_condition"] });

    expect(response.status).toBe(400);
    expect(await prisma.profile.count()).toBe(0);
  });

  it("defaults the optional list fields to empty rather than failing", async () => {
    const token = await registeredUser();

    const response = await request(app)
      .put("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send({
        birth_year: 1996,
        goal: "muscle_gain",
        level: "intermediate",
        space: "small_room",
        equipment: ["resistance_band"],
      });

    expect(response.status).toBe(200);
    expect((response.body as ProfileBody).profile).toMatchObject({
      injuries: [],
      conditions: [],
      dietary: [],
      sex: null,
      height_cm: null,
    });
  });

  it("returns 401 without a token", async () => {
    const response = await request(app).put("/api/v1/profiles/me").send(validProfile);

    expect(response.status).toBe(401);
  });
});
