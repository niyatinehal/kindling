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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const registered = async (dietary: string[] = [], conditions: string[] = []): Promise<string> => {
  const token = await new SignJWT({ email: "", phone: "" })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuer(ISSUER)
    .setAudience("authenticated")
    .setSubject(randomUUID())
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  await request(app)
    .post("/api/v1/auth/register")
    .set(auth(token))
    .send({
      display_name: "Meera",
      locale: "en",
      consents: [{ consent_type: "health_data", policy_version: "2026-08-14" }],
    });

  if (dietary.length > 0 || conditions.length > 0) {
    await request(app)
      .put("/api/v1/profiles/me")
      .set(auth(token))
      .send({
        birth_year: 1990,
        goal: "general_fitness",
        level: "beginner",
        space: "small_room",
        equipment: ["none"],
        dietary,
        conditions,
      });
  }
  return token;
};

type SuggestBody = {
  generator?: string;
  suggestions?: {
    recipe_key: string;
    missing: string[];
    approx_kcal: number;
    cautions: string[];
  }[];
};

const suggest = (token: string, body: Record<string, unknown>) =>
  request(app).post("/api/v1/meals/suggest").set(auth(token)).send(body);

describe("GET /api/v1/meals/ingredients", () => {
  it("serves the vocabulary so the client never hardcodes it", async () => {
    const token = await registered();

    const response = await request(app).get("/api/v1/meals/ingredients").set(auth(token));

    expect(response.status).toBe(200);
    const body = response.body as { ingredients?: string[] };
    expect(body.ingredients).toContain("toor_dal");
    expect(body.ingredients).toContain("rice");
  });
});

describe("POST /api/v1/meals/suggest", () => {
  it("suggests a dish that can be cooked from what is on hand", async () => {
    const token = await registered();

    const response = await suggest(token, { ingredients: ["toor_dal", "rice"] });

    expect(response.status).toBe(200);
    const body = response.body as SuggestBody;
    expect(body.generator).toBe("rules@1");
    const dal = body.suggestions?.find((s) => s.recipe_key === "dal_chawal");
    expect(dal?.missing).toEqual([]);
  });

  // The profile is the source of truth for diet: a client cannot switch it off.
  it("respects the stored profile's diet without being told", async () => {
    const token = await registered(["vegetarian"]);

    const response = await suggest(token, {
      ingredients: ["chicken", "onion", "tomato", "rice", "toor_dal"],
    });

    const keys = (response.body as SuggestBody).suggestions?.map((s) => s.recipe_key) ?? [];
    expect(keys).not.toContain("chicken_curry");
    expect(keys.length).toBeGreaterThan(0);
  });

  it("attaches a caution from the profile's conditions", async () => {
    const token = await registered([], ["type_2_diabetes"]);

    const response = await suggest(token, { ingredients: ["rice", "spices"] });

    const jeera = (response.body as SuggestBody).suggestions?.find(
      (s) => s.recipe_key === "jeera_rice",
    );
    expect(jeera?.cautions).toContain("type_2_diabetes");
  });

  // Unlike a workout plan, this works without a profile — an unconstrained match
  // is a reasonable answer to "what can I cook".
  it("works without a profile at all", async () => {
    const token = await registered();

    const response = await suggest(token, { ingredients: ["rice"] });

    expect(response.status).toBe(200);
    expect((response.body as SuggestBody).suggestions?.length).toBeGreaterThan(0);
  });

  it("rejects an ingredient outside the known vocabulary", async () => {
    const token = await registered();

    const response = await suggest(token, { ingredients: ["unobtainium"] });

    expect(response.status).toBe(400);
  });

  it("returns 401 without a token", async () => {
    const response = await request(app)
      .post("/api/v1/meals/suggest")
      .send({ ingredients: ["rice"] });

    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/meals/parse-pantry", () => {
  const parse = (token: string, body: Record<string, unknown>) =>
    request(app).post("/api/v1/meals/parse-pantry").set(auth(token)).send(body);

  it("reads free text into keys from the vocabulary, with no suggestions attached", async () => {
    const token = await registered();

    const response = await parse(token, { text: "thoda atta, 2 aloo, dahi bacha hai, maggi" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      recognised: ["atta", "potato", "curd"],
      unrecognised: ["maggi"],
      source: "synonyms",
      degraded: false,
      parser: "synonyms@1",
    });
  });

  it("returns 401 without a token", async () => {
    const response = await request(app).post("/api/v1/meals/parse-pantry").send({ text: "aloo" });

    expect(response.status).toBe(401);
  });

  it.each([
    ["empty text", { text: "" }],
    ["text that is only spaces", { text: "   " }],
    ["text over 500 characters", { text: "a".repeat(501) }],
    ["a missing text field", {}],
    ["an extra field", { text: "aloo", userId: "someone-else" }],
  ])("returns 400 VALIDATION_FAILED for %s", async (_label, body) => {
    const token = await registered();

    const response = await parse(token, body);

    expect(response.status).toBe(400);
    expect((response.body as { error?: { code?: string } }).error?.code).toBe("VALIDATION_FAILED");
  });

  it("accepts exactly 500 characters once surrounding spaces are trimmed", async () => {
    const token = await registered();

    const response = await parse(token, { text: `  ${"a".repeat(500)}  ` });

    expect(response.status).toBe(200);
  });
});
