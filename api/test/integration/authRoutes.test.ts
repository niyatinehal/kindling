import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import type { CryptoKey, JWK } from "jose";
import { randomUUID } from "node:crypto";
import request from "supertest";

import { createApp } from "../../src/app.js";
import { rulesPlanGenerator } from "../../src/workouts/planGenerator.js";
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
    planGenerator: rulesPlanGenerator,
    verify: createTokenVerifier({
      issuer: ISSUER,
      audience: "authenticated",
      keys: createLocalJWKSet({ keys: [jwk] }),
    }),
  });

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

// Defaults to the shape a real Supabase anonymous user's token actually has —
// "email" and "phone" both present as keys, both empty strings, never absent
// — so a caller must opt IN to a real email rather than opting out of an
// anonymous one. The old default (a non-empty email, no "phone" key at all)
// is not a shape Supabase ever issues, and it is exactly why this
// real-Postgres suite was blind to a real-Postgres bug: an absent "phone" key
// verifies to `undefined`, and `undefined` never collided even before the
// fix. Only a *present, empty* "phone" claim reaches the partial unique index
// and can collide.
const tokenFor = (
  authUserId: string,
  { email = "", phone = "" }: { email?: string; phone?: string } = {},
): Promise<string> =>
  new SignJWT({ email, phone })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuer(ISSUER)
    .setAudience("authenticated")
    .setSubject(authUserId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

const body = {
  display_name: "Meera",
  locale: "en",
  consents: [{ consent_type: "health_data", policy_version: "2026-08-14" }],
};

type ErrorBody = { error?: { code?: string } };

describe("POST /api/v1/auth/register", () => {
  it("creates the user and returns 201", async () => {
    const token = await tokenFor(randomUUID());

    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    expect(response.status).toBe(201);
    const registerBody = response.body as { display_name?: string };
    expect(registerBody.display_name).toBe("Meera");
  });

  it("rejects a body with no health_data consent", async () => {
    const token = await tokenFor(randomUUID());

    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...body,
        consents: [{ consent_type: "marketing_notifications", policy_version: "1" }],
      });

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error?.code).toBe("VALIDATION_FAILED");
  });

  it("returns 401 without a token", async () => {
    const response = await request(app).post("/api/v1/auth/register").send(body);

    expect(response.status).toBe(401);
    expect((response.body as ErrorBody).error?.code).toBe("UNAUTHENTICATED");
  });

  // The regression this guards: Supabase issues "" — not a missing key, not
  // null — for an identity an anonymous account doesn't have, so every real
  // anonymous user's token carries a literal `"phone": ""`. The partial unique
  // index behind `users.phone` exempts only NULL, so a second such account
  // used to collide with the first and fail registration with a 500 (Unique
  // constraint failed on the fields: (`phone`)). This is the invariant that
  // matters, not the normalisation that fixes it: two accounts with no phone
  // number must both be able to register.
  it("lets two guests in a row register despite neither having a phone number", async () => {
    const first = await tokenFor(randomUUID(), { email: "", phone: "" });
    const firstResponse = await request(app)
      .post("/api/v1/auth/register")
      .set("Authorization", `Bearer ${first}`)
      .send(body);
    expect(firstResponse.status).toBe(201);

    const second = await tokenFor(randomUUID(), { email: "", phone: "" });
    const secondResponse = await request(app)
      .post("/api/v1/auth/register")
      .set("Authorization", `Bearer ${second}`)
      .send(body);
    expect(secondResponse.status).toBe(201);
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns the caller once registered", async () => {
    const authUserId = randomUUID();
    const token = await tokenFor(authUserId);
    await request(app)
      .post("/api/v1/auth/register")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ display_name: "Meera", family: null });
  });

  it("returns 403 REGISTRATION_REQUIRED before registering", async () => {
    const token = await tokenFor(randomUUID());

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error?.code).toBe("REGISTRATION_REQUIRED");
  });

  it("leaves /healthz reachable without a token", async () => {
    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
  });
});
