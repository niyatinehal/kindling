import { describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

import { createApp } from "../../src/app.js";
import { rulesPlanGenerator } from "../../src/workouts/planGenerator.js";

function appWith(token: string | undefined) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    errorEvent: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve(args.data);
      }),
    },
  } as unknown as Parameters<typeof createApp>[0]["prisma"];

  const app = createApp({
    checkDatabase: () => Promise.resolve(),
    prisma,
    planGenerator: rulesPlanGenerator,
    verify: () => Promise.resolve({ authUserId: "unused" }),
    ...(token === undefined ? {} : { internalReportToken: token }),
  });

  return { app, created };
}

const REPORT = { code: "OTP_REQUEST_FAILED", path: "/api/auth/otp", status: 502 };

/**
 * The gap this closes. When Brevo's daily quota runs out, `signInWithOtp`
 * returns an error, the web route logs it and answers OTP_REQUEST_FAILED — a
 * HANDLED failure, in a Next.js route handler, on Vercel. It never reaches the
 * express error handler and so never reached the error table, which meant the
 * one failure most likely to ruin a launch day was the one nobody could see.
 */
describe("POST /api/v1/internal/error-reports", () => {
  it("records a failure the web app handled itself", async () => {
    const { app, created } = appWith("shared-secret");

    const response = await request(app)
      .post("/api/v1/internal/error-reports")
      .set("x-internal-token", "shared-secret")
      .send(REPORT);

    expect(response.status).toBe(202);
    expect(created[0]).toMatchObject({
      name: "OTP_REQUEST_FAILED",
      path: "/api/auth/otp",
      status: 502,
    });
  });

  it("refuses a caller without the shared secret", async () => {
    const { app, created } = appWith("shared-secret");

    const response = await request(app).post("/api/v1/internal/error-reports").send(REPORT);

    expect(response.status).toBe(401);
    expect(created).toHaveLength(0);
  });

  /*
    With no token configured the endpoint does not exist at all, rather than
    existing and accepting anything. An open write endpoint is a way to fill
    somebody's table, and a 404 does not advertise that there is a door here to
    find the key for.
  */
  it("is not there at all when no token is configured", async () => {
    const { app, created } = appWith(undefined);

    const response = await request(app)
      .post("/api/v1/internal/error-reports")
      .set("x-internal-token", "anything")
      .send(REPORT);

    expect(response.status).toBe(404);
    expect(created).toHaveLength(0);
  });

  // The web app is a client like any other. A report is a claim, not a fact,
  // and a free-text field somebody can post into is a free-text field in a
  // table somebody will later read.
  it("rejects a report that does not fit the shape", async () => {
    const { app } = appWith("shared-secret");

    const response = await request(app)
      .post("/api/v1/internal/error-reports")
      .set("x-internal-token", "shared-secret")
      .send({ code: "x".repeat(500), status: 502 });

    expect(response.status).toBe(400);
  });

  it("redacts the detail it is given", async () => {
    const { app, created } = appWith("shared-secret");

    await request(app)
      .post("/api/v1/internal/error-reports")
      .set("x-internal-token", "shared-secret")
      .send({ ...REPORT, detail: "quota exceeded for meera@example.com" });

    expect(created[0]?.["message"]).toBe("quota exceeded for [redacted:email]");
  });
});
