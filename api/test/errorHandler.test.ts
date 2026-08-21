import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

import { createApp } from "../src/app.js";
import { rulesPlanGenerator } from "../src/workouts/planGenerator.js";

/**
 * Every route in this app dispatches failures with `next(error)` (see
 * src/routes/auth.ts and src/auth/middleware.ts). This drives that path
 * through a real route — GET /api/v1/auth/me — rather than a bespoke throwing
 * router, so the test exercises the exact wiring production traffic uses: the
 * middleware authenticates fine, then the route's own `.catch(next)` receives
 * a rejection from a broken `prisma.user.findUniqueOrThrow` and forwards it to
 * app.ts's error-handling middleware.
 */
const USER = {
  id: "019ffb29-df8f-70ed-a89f-78209ecb2f59",
  authUserId: "aafc8a5a-3b92-40ff-ae7a-a5e6dce2624b",
  memberships: [] as { familyId: string; role: "admin" | "adult" | "child" | "elderly" }[],
};

const DISTINCTIVE_SECRET = "definitely-not-safe-to-leak-9f1c3b";

function appWithBrokenSecondLookup() {
  const prisma = {
    user: {
      findFirst: () => Promise.resolve(USER),
      findUniqueOrThrow: () =>
        Promise.reject(
          new Error(`connection to postgres://user:${DISTINCTIVE_SECRET}@host/db failed`),
        ),
    },
  } as unknown as Parameters<typeof createApp>[0]["prisma"];

  return createApp({
    checkDatabase: () => Promise.resolve(),
    prisma,
    planGenerator: rulesPlanGenerator,
    verify: () => Promise.resolve({ authUserId: USER.authUserId }),
  });
}

describe("error-handling middleware", () => {
  let errorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("turns a thrown/rejected error from a route into a 500 INTERNAL envelope", async () => {
    const response = await request(appWithBrokenSecondLookup())
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer irrelevant");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL", message: expect.any(String) },
    });
  });

  it("never puts a stack trace or the thrown error's message text in the response body", async () => {
    const response = await request(appWithBrokenSecondLookup())
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer irrelevant");

    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain(DISTINCTIVE_SECRET);
    expect(raw).not.toContain("postgres://");
    expect(raw.toLowerCase()).not.toContain("at object.");
    expect(response.body).not.toHaveProperty("stack");
  });

  /*
    This used to assert the opposite of its second half: that the log line
    contained the connection string, password and all. That was the right test
    while "logged" meant one line in a terminal somebody was watching — the
    thing it was guarding against was the error being swallowed.

    Two things changed. The message is now redacted on its way out, and it is
    also written to a table that is kept indefinitely, so a password in it is
    not a fleeting line in a scrollback any more. Both halves of the intent
    still hold and are asserted separately: the failure is identifiable, and
    the credential is not written down.
  */
  it("records the failure server-side without writing the credential down", async () => {
    await request(appWithBrokenSecondLookup())
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer irrelevant");

    expect(errorSpy).toHaveBeenCalled();
    const logged: string[] = errorSpy.mock.calls.flat().map((value: unknown) => String(value));
    const line = logged.find((entry) => entry.includes("unhandled_error"));

    expect(line).toBeDefined();
    // Identifiable: which request, on which route.
    expect(line).toContain("/api/v1/auth/me");
    // And redacted, rather than merely absent — the difference between the
    // secret being stripped and the message being dropped altogether.
    expect(line).toContain("[redacted:connection-string]");
    expect(line).not.toContain(DISTINCTIVE_SECRET);
  });
});
