import { afterAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

import { createApp } from "../../src/app.js";
import { createPrismaClient, disconnect } from "../../src/db/prisma.js";
import { rulesPlanGenerator } from "../../src/workouts/planGenerator.js";

const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);

const USER = {
  id: "019ffb29-df8f-70ed-a89f-78209ecb2f59",
  authUserId: "aafc8a5a-3b92-40ff-ae7a-a5e6dce2624b",
  memberships: [] as unknown[],
};

const SECRET = "not-safe-to-leak-4b91";

/**
 * The real thing, against real Postgres: a route fails, and a row lands in the
 * table. The unit tests prove `recordError` behaves; this proves it is wired
 * to the path production traffic actually takes, and that the column it lands
 * in tolerates what gets put there.
 *
 * The user lookup is stubbed to reject while `errorEvent` stays real, so the
 * failure is genuine and the write is genuine.
 */
function appWithFailingRoute() {
  const client = {
    user: {
      findFirst: () => Promise.resolve(USER),
      findUniqueOrThrow: () =>
        Promise.reject(new Error(`connect to postgres://user:${SECRET}@host/db failed`)),
    },
    errorEvent: prisma.errorEvent,
  } as unknown as Parameters<typeof createApp>[0]["prisma"];

  return createApp({
    checkDatabase: () => Promise.resolve(),
    prisma: client,
    planGenerator: rulesPlanGenerator,
    verify: () => Promise.resolve({ authUserId: USER.authUserId }),
  });
}

beforeEach(async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  await prisma.errorEvent.deleteMany();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await disconnect(prisma);
});

describe("recording a production failure", () => {
  it("writes the failure down, redacted, and hands the caller its request id", async () => {
    const response = await request(appWithFailingRoute())
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer irrelevant");

    expect(response.status).toBe(500);

    const id = String(response.headers["x-request-id"] ?? "");
    expect(id).not.toBe("");

    // The write is deliberately not awaited by the error handler — the caller
    // gets its 500 first — so this waits for it rather than assuming it landed.
    let stored = await prisma.errorEvent.findFirst({ where: { requestId: id } });
    for (let attempt = 0; attempt < 20 && stored === null; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      stored = await prisma.errorEvent.findFirst({ where: { requestId: id } });
    }

    expect(stored).not.toBeNull();
    expect(stored?.path).toBe("/api/v1/auth/me");
    expect(stored?.method).toBe("GET");
    expect(stored?.status).toBe(500);
    // The whole point of the redaction layer, checked where it actually
    // matters: in the row, not in the function's return value.
    expect(stored?.message).not.toContain(SECRET);
    expect(stored?.message).toContain("[redacted:connection-string]");
  });
});
