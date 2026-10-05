import { afterAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import type { CryptoKey, JWK } from "jose";
import { randomUUID } from "node:crypto";
import request from "supertest";

import { createApp } from "../../src/app.js";
import { createTokenVerifier } from "../../src/auth/verifyToken.js";
import { createPrismaClient, disconnect } from "../../src/db/prisma.js";
import type { LlmClient } from "../../src/llm/client.js";
import { FakeLlmClient } from "../../src/llm/fakeClient.js";
import { rulesPlanGenerator } from "../../src/workouts/planGenerator.js";

const ISSUER = "http://127.0.0.1:54321/auth/v1";
const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);
let privateKey: CryptoKey;
let app: ReturnType<typeof createApp>;
let verify: Parameters<typeof createApp>[0]["verify"];

/** The same app, with a model client — `app` itself runs with the model switched off. */
const appWith = (llm: LlmClient) =>
  createApp({
    checkDatabase: () => Promise.resolve(),
    prisma,
    planGenerator: rulesPlanGenerator,
    verify,
    llm,
  });

beforeEach(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  const jwk: JWK = {
    ...(await exportJWK(pair.publicKey)),
    kid: "test-key",
    alg: "ES256",
    use: "sig",
  };

  verify = createTokenVerifier({
    issuer: ISSUER,
    audience: "authenticated",
    keys: createLocalJWKSet({ keys: [jwk] }),
  });
  app = createApp({
    checkDatabase: () => Promise.resolve(),
    prisma,
    planGenerator: rulesPlanGenerator,
    verify,
  });

  await prisma.pantryParseCache.deleteMany();
  await prisma.llmCall.deleteMany();
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

  // Every item the intake screen offers must be accepted, or ticking it fails
  // the whole request. Milk once did.
  it("accepts milk from the intake screen", async () => {
    const token = await registered();

    const response = await suggest(token, { ingredients: ["milk", "rice"] });

    expect(response.status).toBe(200);
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

describe("POST /api/v1/meals/parse-pantry — the model path", () => {
  const MODEL_ANSWER = { recognised: ["paneer", "spinach"], unrecognised: [] };

  /** The most recently registered user, which is the one a test just made. */
  const newestUser = () => prisma.user.findFirstOrThrow({ orderBy: { createdAt: "desc" } });

  const consent = async (token: string, server: ReturnType<typeof createApp>) =>
    request(server).put("/api/v1/meals/pantry-consent").set(auth(token)).send({ enabled: true });

  const parseWith = (server: ReturnType<typeof createApp>, token: string, text: string) =>
    request(server).post("/api/v1/meals/parse-pantry").set(auth(token)).send({ text });

  it("uses the model once the user has consented", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const server = appWith(llm);
    const token = await registered(["vegetarian"], ["type_2_diabetes"]);
    await consent(token, server);

    const response = await parseWith(server, token, "palak aur paneer");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...MODEL_ANSWER,
      source: "llm",
      degraded: false,
      parser: "llm-pantry@1",
    });
  });

  // Data minimisation: the prompt carries the pantry text and the vocabulary,
  // and nothing from the profile or the account.
  it("sends the provider nothing about the person", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const server = appWith(llm);
    const token = await registered(["vegetarian"], ["type_2_diabetes"]);
    await consent(token, server);
    const user = await newestUser();

    await parseWith(server, token, "palak aur paneer");

    const sent = JSON.stringify(llm.calls);
    for (const fact of ["Meera", "vegetarian", "type_2_diabetes", "1990", user.id]) {
      expect(sent).not.toContain(fact);
    }
  });

  it("never calls the model without consent", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const token = await registered(["vegetarian"]);

    const response = await parseWith(appWith(llm), token, "palak aur paneer");

    expect(response.body).toMatchObject({ source: "synonyms", degraded: false });
    expect(llm.calls).toHaveLength(0);
  });

  it("stops calling the model the moment consent is withdrawn", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const server = appWith(llm);
    const token = await registered(["vegetarian"]);
    await consent(token, server);
    await request(server)
      .put("/api/v1/meals/pantry-consent")
      .set(auth(token))
      .send({ enabled: false });

    const response = await parseWith(server, token, "palak aur paneer");

    expect(response.body).toMatchObject({ source: "synonyms" });
    expect(llm.calls).toHaveLength(0);
  });

  // The flag is set behind the API's back here, as though the account had
  // consented as an adult and later become a child member. The role check at
  // parse time still wins.
  it("never calls the model for a child account, whatever its flag says", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const token = await registered(["vegetarian"]);
    const child = await newestUser();
    await prisma.profile.update({
      where: { userId: child.id },
      data: { aiPantryConsent: true, aiPantryConsentAt: new Date() },
    });
    const family = await prisma.family.create({
      data: { name: "Sharma", createdByUserId: child.id },
    });
    await prisma.familyMembership.create({
      data: {
        familyId: family.id,
        userId: child.id,
        role: "child",
        status: "active",
        joinedAt: new Date(),
      },
    });

    const response = await parseWith(appWith(llm), token, "palak aur paneer");

    expect(response.body).toMatchObject({ source: "synonyms" });
    expect(llm.calls).toHaveLength(0);
  });

  // No family needed: the profile's birth year alone marks a minor.
  it("never calls the model for a minor, whatever their flag says", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const token = await registered(["vegetarian"]);
    const minor = await newestUser();
    await prisma.profile.update({
      where: { userId: minor.id },
      data: {
        birthYear: new Date().getUTCFullYear() - 15,
        aiPantryConsent: true,
        aiPantryConsentAt: new Date(),
      },
    });

    const response = await parseWith(appWith(llm), token, "palak aur paneer");

    expect(response.body).toMatchObject({ source: "synonyms" });
    expect(llm.calls).toHaveLength(0);
  });

  it("answers 200 from the synonym table when the model fails", async () => {
    const llm = new FakeLlmClient([{ fail: "timeout" }]);
    const server = appWith(llm);
    const token = await registered(["vegetarian"]);
    await consent(token, server);
    jest.spyOn(console, "warn").mockImplementation(() => {});

    const response = await parseWith(server, token, "palak aur paneer");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      recognised: ["spinach", "paneer"],
      source: "synonyms",
      degraded: true,
    });
    jest.restoreAllMocks();
  });
});

describe("/api/v1/meals/pantry-consent", () => {
  const llm = new FakeLlmClient([{ output: { recognised: [], unrecognised: [] } }]);
  const newestUser = () => prisma.user.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  const getConsent = (server: ReturnType<typeof createApp>, token: string) =>
    request(server).get("/api/v1/meals/pantry-consent").set(auth(token));
  const putConsent = (server: ReturnType<typeof createApp>, token: string, body: object) =>
    request(server).put("/api/v1/meals/pantry-consent").set(auth(token)).send(body);

  it("is off by default and offered to an adult with a profile", async () => {
    const token = await registered(["vegetarian"]);

    const response = await getConsent(appWith(llm), token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: false, available: true });
  });

  it("is not offered while the model is switched off", async () => {
    const token = await registered(["vegetarian"]);

    const response = await getConsent(app, token);

    expect(response.body).toEqual({ enabled: false, available: false });
  });

  it("is not offered before a profile exists to hold it", async () => {
    const token = await registered();

    expect((await getConsent(appWith(llm), token)).body).toEqual({
      enabled: false,
      available: false,
    });
    const put = await putConsent(appWith(llm), token, { enabled: true });
    expect(put.status).toBe(403);
    expect((put.body as { error: { code: string } }).error.code).toBe("PROFILE_REQUIRED");
  });

  it("records when consent was given, and clears it on withdrawal", async () => {
    const server = appWith(llm);
    const token = await registered(["vegetarian"]);
    const user = await newestUser();

    const on = await putConsent(server, token, { enabled: true });
    const given = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });

    expect(on.body).toEqual({ enabled: true, available: true });
    expect(given.aiPantryConsent).toBe(true);
    expect(given.aiPantryConsentAt).toBeInstanceOf(Date);

    // Re-giving consent keeps the original time.
    await putConsent(server, token, { enabled: true });
    const again = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(again.aiPantryConsentAt).toEqual(given.aiPantryConsentAt);

    await putConsent(server, token, { enabled: false });
    const withdrawn = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(withdrawn.aiPantryConsent).toBe(false);
    expect(withdrawn.aiPantryConsentAt).toBeNull();
  });

  it("refuses consent from a child account but lets it withdraw", async () => {
    const token = await registered(["vegetarian"]);
    const child = await newestUser();
    const family = await prisma.family.create({
      data: { name: "Sharma", createdByUserId: child.id },
    });
    await prisma.familyMembership.create({
      data: {
        familyId: family.id,
        userId: child.id,
        role: "child",
        status: "active",
        joinedAt: new Date(),
      },
    });

    const on = await putConsent(appWith(llm), token, { enabled: true });
    const off = await putConsent(appWith(llm), token, { enabled: false });
    const state = await getConsent(appWith(llm), token);

    expect(on.status).toBe(403);
    expect((on.body as { error: { code: string } }).error.code).toBe("FORBIDDEN_ROLE");
    expect(off.status).toBe(200);
    expect(state.body).toEqual({ enabled: false, available: false });
  });

  it("refuses consent from a minor and does not offer it", async () => {
    const token = await registered(["vegetarian"]);
    const minor = await newestUser();
    await prisma.profile.update({
      where: { userId: minor.id },
      data: { birthYear: new Date().getUTCFullYear() - 15 },
    });

    const on = await putConsent(appWith(llm), token, { enabled: true });
    const state = await getConsent(appWith(llm), token);

    expect(on.status).toBe(403);
    expect(state.body).toEqual({ enabled: false, available: false });
  });

  it.each([
    ["a missing field", {}],
    ["a non-boolean", { enabled: "yes" }],
    ["an extra field", { enabled: true, userId: "someone-else" }],
  ])("returns 400 for %s", async (_label, body) => {
    const token = await registered(["vegetarian"]);

    const response = await putConsent(appWith(llm), token, body);

    expect(response.status).toBe(400);
  });

  it("returns 401 without a token", async () => {
    const response = await request(appWith(llm)).get("/api/v1/meals/pantry-consent");

    expect(response.status).toBe(401);
  });

  // Enforced by the database, not just the route: a consent with no time it
  // was given, or a time with no consent, cannot be stored.
  it("keeps the consent time and the flag in step at the database level", async () => {
    await registered(["vegetarian"]);
    const user = await newestUser();

    await expect(
      prisma.profile.update({ where: { userId: user.id }, data: { aiPantryConsent: true } }),
    ).rejects.toThrow();
  });
});

describe("POST /api/v1/meals/parse-pantry — cache, limit and records", () => {
  const MODEL_ANSWER = { recognised: ["paneer", "spinach"], unrecognised: [] };
  const newestUser = () => prisma.user.findFirstOrThrow({ orderBy: { createdAt: "desc" } });

  /** A registered adult with a profile who has turned AI reading on. */
  const consentingAdult = async (server: ReturnType<typeof createApp>) => {
    const token = await registered(["vegetarian"]);
    await request(server)
      .put("/api/v1/meals/pantry-consent")
      .set(auth(token))
      .send({ enabled: true });
    return { token, user: await newestUser() };
  };

  const parseWith = (server: ReturnType<typeof createApp>, token: string, text: string) =>
    request(server).post("/api/v1/meals/parse-pantry").set(auth(token)).send({ text });

  /** Rows as though `count` parses had already reached the model today. */
  const priorParses = (userId: string, count: number, createdAt = new Date()) =>
    prisma.llmCall.createMany({
      data: Array.from({ length: count }, () => ({
        userId,
        feature: "pantry_parse",
        model: "fake",
        promptVersion: "llm-pantry@1",
        outcome: "ok" as const,
        latencyMs: 300,
        requestId: randomUUID(),
        createdAt,
      })),
    });

  it("writes an LlmCall row and a cache row, and no copy of the text", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const server = appWith(llm);
    const { token, user } = await consentingAdult(server);

    const response = await parseWith(server, token, "Palak aur paneer");

    const calls = await prisma.llmCall.findMany({ where: { userId: user.id } });
    const cache = await prisma.pantryParseCache.findMany();
    expect(calls).toEqual([
      expect.objectContaining({
        feature: "pantry_parse",
        outcome: "ok",
        model: "fake",
        promptVersion: "llm-pantry@1",
        inputTokens: 100,
        outputTokens: 20,
        requestId: response.headers["x-request-id"],
      }),
    ]);
    expect(cache).toEqual([
      expect.objectContaining({
        recognised: ["paneer", "spinach"],
        unrecognised: [],
        promptVersion: "llm-pantry@1",
      }),
    ]);
    expect(cache[0]?.textHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify({ calls, cache }).toLowerCase()).not.toContain("palak");
  });

  it("serves the second person to type the same pantry from the cache", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const server = appWith(llm);
    const first = await consentingAdult(server);
    const second = await consentingAdult(server);

    await parseWith(server, first.token, "palak, paneer");
    const response = await parseWith(server, second.token, "Paneer,  Palak");

    expect(response.body).toMatchObject({ ...MODEL_ANSWER, source: "cache" });
    expect(llm.calls).toHaveLength(1);
  });

  it("answers the 31st parse of the day from synonyms, without calling the model", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const server = appWith(llm);
    const { token, user } = await consentingAdult(server);
    await priorParses(user.id, 30);

    const response = await parseWith(server, token, "palak aur paneer");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      recognised: ["spinach", "paneer"],
      source: "synonyms",
      degraded: true,
    });
    expect(llm.calls).toHaveLength(0);
    expect(
      await prisma.llmCall.count({ where: { userId: user.id, outcome: "rate_limited" } }),
    ).toBe(1);
  });

  // A retry is two rows for one parse; the limit is on parses.
  it("counts a retried parse once", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const server = appWith(llm);
    const { token, user } = await consentingAdult(server);
    await priorParses(user.id, 29);
    const retried = randomUUID();
    await prisma.llmCall.createMany({
      data: (["provider_error", "ok"] as const).map((outcome) => ({
        userId: user.id,
        feature: "pantry_parse",
        model: "fake",
        promptVersion: "llm-pantry@1",
        outcome,
        latencyMs: 300,
        requestId: retried,
      })),
    });

    // 30 parses so far, in 31 rows: this one is over the limit, but only just
    // — the failed first attempt of the retried parse is not counted.
    const response = await parseWith(server, token, "palak aur paneer");

    expect(response.body).toMatchObject({ source: "synonyms", degraded: true });
  });

  // The request id can come from the caller, so it must not be what the limit
  // counts by — or sending the same one every time would mean unlimited calls.
  it("cannot be walked around by reusing one request id", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const server = appWith(llm);
    const { token, user } = await consentingAdult(server);
    const reused = "same-id-every-time";
    await prisma.llmCall.createMany({
      data: Array.from({ length: 30 }, () => ({
        userId: user.id,
        feature: "pantry_parse",
        model: "fake",
        promptVersion: "llm-pantry@1",
        outcome: "ok" as const,
        latencyMs: 300,
        requestId: reused,
      })),
    });

    const response = await request(server)
      .post("/api/v1/meals/parse-pantry")
      .set(auth(token))
      .set("x-request-id", reused)
      .send({ text: "palak aur paneer" });

    expect(response.body).toMatchObject({ source: "synonyms", degraded: true });
    expect(llm.calls).toHaveLength(0);
  });

  it("does not count yesterday's parses against today", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const server = appWith(llm);
    const { token, user } = await consentingAdult(server);
    await priorParses(user.id, 30, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));

    const response = await parseWith(server, token, "palak aur paneer");

    expect(response.body).toMatchObject({ source: "llm" });
  });

  it("removes a person's LlmCall rows when their account is deleted", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const server = appWith(llm);
    const { token, user } = await consentingAdult(server);
    await parseWith(server, token, "palak aur paneer");
    expect(await prisma.llmCall.count({ where: { userId: user.id } })).toBe(1);

    const deleted = await request(server).delete("/api/v1/auth/me").set(auth(token));

    expect(deleted.status).toBe(204);
    expect(await prisma.llmCall.count({ where: { userId: user.id } })).toBe(0);
  });
});
