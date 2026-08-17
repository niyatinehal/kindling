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

/** Today, as the API's UTC calendar day. */
const today = (): string => new Date().toISOString().slice(0, 10);

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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const registered = async (): Promise<string> => {
  const token = await tokenFor(randomUUID());
  await request(app)
    .post("/api/v1/auth/register")
    .set(auth(token))
    .send({
      display_name: "Meera",
      locale: "en",
      consents: [{ consent_type: "health_data", policy_version: "2026-08-14" }],
    });
  return token;
};

/** A registered user with a profile and an active plan. */
const withPlan = async (): Promise<string> => {
  const token = await registered();
  await request(app)
    .put("/api/v1/profiles/me")
    .set(auth(token))
    .send({
      birth_year: 1996,
      goal: "general_fitness",
      level: "beginner",
      space: "large_room",
      equipment: ["none"],
    });
  await request(app).post("/api/v1/plans").set(auth(token));
  return token;
};

const log = (token: string, body: Record<string, unknown>) =>
  request(app).post("/api/v1/tracking/logs").set(auth(token)).send(body);

type SummaryBody = {
  summary?: {
    water_ml?: number;
    sleep_minutes?: number;
    sleep_nights?: number;
    workouts_completed?: number;
    workouts_scheduled?: number;
    workout_adherence?: number | null;
    meals_logged?: number;
  };
  today?: { plan_exercise_id: string; status: string }[];
};
type ErrorBody = { error?: { code?: string } };

describe("POST /api/v1/tracking/logs — water", () => {
  it("accepts a glass and sums repeats across the day", async () => {
    const token = await registered();

    await log(token, { type: "water", logged_for: today(), value: 250 }).expect(201);
    await log(token, { type: "water", logged_for: today(), value: 250 }).expect(201);
    await log(token, { type: "water", logged_for: today(), value: 500 }).expect(201);

    const summary = await request(app).get("/api/v1/tracking/summary").set(auth(token));
    expect((summary.body as SummaryBody).summary?.water_ml).toBe(1000);
  });

  // Water is a quantity, not a scheduled thing, so each tap is a NEW fact.
  it("appends rather than replacing, unlike a workout tick", async () => {
    const token = await registered();
    await log(token, { type: "water", logged_for: today(), value: 250 });
    await log(token, { type: "water", logged_for: today(), value: 250 });

    expect(await prisma.trackingLog.count({ where: { type: "water" } })).toBe(2);
  });

  it("rejects an implausible amount rather than storing it", async () => {
    const token = await registered();

    const response = await log(token, { type: "water", logged_for: today(), value: 99999 });

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error?.code).toBe("VALIDATION_FAILED");
    expect(await prisma.trackingLog.count()).toBe(0);
  });

  // The fields mean different things per type, so a water entry carrying an
  // exercise id is nonsense the schema refuses.
  it("rejects water carrying a plan exercise id", async () => {
    const token = await registered();

    const response = await log(token, {
      type: "water",
      logged_for: today(),
      value: 250,
      plan_exercise_id: randomUUID(),
    });

    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/tracking/logs — sleep", () => {
  it("records a night and reports it in hours-worth of minutes", async () => {
    const token = await registered();

    await log(token, { type: "sleep", logged_for: today(), value: 450, rating: 4 }).expect(201);

    const summary = await request(app).get("/api/v1/tracking/summary").set(auth(token));
    expect((summary.body as SummaryBody).summary?.sleep_minutes).toBe(450);
    expect((summary.body as SummaryBody).summary?.sleep_nights).toBe(1);
  });

  // "I slept 7 hours" is one fact about one night — logging again corrects it
  // rather than claiming a second night's sleep.
  it("corrects the same night instead of adding another", async () => {
    const token = await registered();
    await log(token, { type: "sleep", logged_for: today(), value: 450 });
    await log(token, { type: "sleep", logged_for: today(), value: 400 });

    const summary = await request(app).get("/api/v1/tracking/summary").set(auth(token));
    expect((summary.body as SummaryBody).summary?.sleep_minutes).toBe(400);
    expect((summary.body as SummaryBody).summary?.sleep_nights).toBe(1);
    expect(await prisma.trackingLog.count({ where: { type: "sleep" } })).toBe(1);
  });

  it("rejects more sleep than a day contains", async () => {
    const token = await registered();

    expect((await log(token, { type: "sleep", logged_for: today(), value: 2000 })).status).toBe(
      400,
    );
  });
});

describe("POST /api/v1/tracking/logs — workouts", () => {
  it("ticks a scheduled exercise off and reports adherence", async () => {
    const token = await withPlan();
    const exercise = await prisma.planExercise.findFirstOrThrow();

    await log(token, {
      type: "workout",
      logged_for: today(),
      plan_exercise_id: exercise.id,
      status: "completed",
      rating: 3,
    }).expect(201);

    const summary = await request(app).get("/api/v1/tracking/summary").set(auth(token));
    const body = (summary.body as SummaryBody).summary;
    expect(body?.workouts_completed).toBe(1);
    expect(body?.workouts_scheduled).toBeGreaterThan(0);
    expect(body?.workout_adherence).toBeGreaterThan(0);
  });

  // A double tap is the same fact twice, and must not inflate adherence.
  it("is idempotent on re-ticking the same exercise", async () => {
    const token = await withPlan();
    const exercise = await prisma.planExercise.findFirstOrThrow();
    const entry = {
      type: "workout",
      logged_for: today(),
      plan_exercise_id: exercise.id,
      status: "completed",
    };

    await log(token, entry);
    await log(token, entry);

    expect(await prisma.trackingLog.count({ where: { type: "workout" } })).toBe(1);
    const summary = await request(app).get("/api/v1/tracking/summary").set(auth(token));
    expect((summary.body as SummaryBody).summary?.workouts_completed).toBe(1);
  });

  it("lets a completed tick be corrected to skipped", async () => {
    const token = await withPlan();
    const exercise = await prisma.planExercise.findFirstOrThrow();

    await log(token, {
      type: "workout",
      logged_for: today(),
      plan_exercise_id: exercise.id,
      status: "completed",
    });
    await log(token, {
      type: "workout",
      logged_for: today(),
      plan_exercise_id: exercise.id,
      status: "skipped",
    });

    const summary = await request(app).get("/api/v1/tracking/summary").set(auth(token));
    expect((summary.body as SummaryBody).summary?.workouts_completed).toBe(0);
  });

  it("reports today's ticks so the plan screen can show what is done", async () => {
    const token = await withPlan();
    const exercise = await prisma.planExercise.findFirstOrThrow();
    await log(token, {
      type: "workout",
      logged_for: today(),
      plan_exercise_id: exercise.id,
      status: "completed",
    });

    const summary = await request(app).get("/api/v1/tracking/summary").set(auth(token));

    expect((summary.body as SummaryBody).today).toEqual([
      { plan_exercise_id: exercise.id, status: "completed" },
    ]);
  });
});

describe("GET /api/v1/tracking/summary", () => {
  it("starts at zero rather than at nothing", async () => {
    const token = await registered();

    const response = await request(app).get("/api/v1/tracking/summary").set(auth(token));

    expect(response.status).toBe(200);
    expect((response.body as SummaryBody).summary).toMatchObject({
      water_ml: 0,
      sleep_minutes: 0,
      workouts_completed: 0,
      meals_logged: 0,
    });
  });

  // Zero would read as "you did none of your workouts" to someone who has no
  // plan. Null is the honest answer to a question that has not been asked yet.
  it("reports adherence as null when nothing is scheduled", async () => {
    const token = await registered();

    const response = await request(app).get("/api/v1/tracking/summary").set(auth(token));

    expect((response.body as SummaryBody).summary?.workout_adherence).toBeNull();
    expect((response.body as SummaryBody).summary?.workouts_scheduled).toBe(0);
  });

  it("never counts one member's logs toward another's", async () => {
    const meera = await registered();
    const other = await registered();
    await log(other, { type: "water", logged_for: today(), value: 2000 });

    const response = await request(app).get("/api/v1/tracking/summary").set(auth(meera));

    expect((response.body as SummaryBody).summary?.water_ml).toBe(0);
  });

  it("returns 401 without a token", async () => {
    expect((await request(app).get("/api/v1/tracking/summary")).status).toBe(401);
  });
});

// "There should be an option to add a dish as well if not mentioned, so it can be
// tracked." FR-TRK-2 logs meals "from suggested plan or freeform" — these are the
// two paths, and they stay distinguishable.
describe("POST /api/v1/tracking/logs — meals", () => {
  it("logs a library dish by key", async () => {
    const token = await registered();

    await log(token, {
      type: "meal",
      logged_for: today(),
      status: "completed",
      recipe_key: "dal_chawal",
    }).expect(201);

    const stored = await prisma.trackingLog.findFirstOrThrow({ where: { type: "meal" } });
    expect(stored.recipeKey).toBe("dal_chawal");
    expect(stored.notes).toBeNull();
  });

  it("logs a dish the library has never heard of", async () => {
    const token = await registered();

    await log(token, {
      type: "meal",
      logged_for: today(),
      status: "completed",
      notes: "Amma's avial",
    }).expect(201);

    const stored = await prisma.trackingLog.findFirstOrThrow({ where: { type: "meal" } });
    // Null key, prose name — so a history view knows to show it verbatim rather
    // than trying to translate it.
    expect(stored.recipeKey).toBeNull();
    expect(stored.notes).toBe("Amma's avial");
  });

  it("counts a custom dish toward the week exactly like a library one", async () => {
    const token = await registered();

    await log(token, { type: "meal", logged_for: today(), status: "completed", notes: "Avial" });
    await log(token, {
      type: "meal",
      logged_for: today(),
      status: "completed",
      recipe_key: "poha",
    });

    const summary = await request(app).get("/api/v1/tracking/summary").set(auth(token));
    expect((summary.body as SummaryBody).summary?.meals_logged).toBe(2);
  });

  // A meal log naming nothing records that someone ate something unspecified — it
  // moves adherence while telling nobody anything.
  it("refuses a meal that names neither a dish nor a description", async () => {
    const token = await registered();

    const response = await log(token, {
      type: "meal",
      logged_for: today(),
      status: "completed",
    });

    expect(response.status).toBe(400);
    expect(await prisma.trackingLog.count()).toBe(0);
  });

  it("refuses a blank name rather than storing whitespace", async () => {
    const token = await registered();

    expect(
      (await log(token, { type: "meal", logged_for: today(), status: "completed", notes: "   " }))
        .status,
    ).toBe(400);
  });

  it("records a skipped meal too, so a planned dish can be declined", async () => {
    const token = await registered();

    await log(token, {
      type: "meal",
      logged_for: today(),
      status: "skipped",
      recipe_key: "upma",
    }).expect(201);

    const summary = await request(app).get("/api/v1/tracking/summary").set(auth(token));
    // Logged either way: "I skipped this" is data, and adherence for meals is a
    // later slice's job to compute from status.
    expect((summary.body as SummaryBody).summary?.meals_logged).toBe(1);
  });
});
