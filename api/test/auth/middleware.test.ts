import { describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";

import { InvalidTokenError } from "../../src/auth/verifyToken.js";
import { createAuthMiddleware } from "../../src/auth/middleware.js";

type ProbeBody = {
  user?: { id?: string; authUserId?: string; familyId?: string; role?: string };
  error?: { code?: string };
};

const USER = {
  id: "019ffb29-df8f-70ed-a89f-78209ecb2f59",
  authUserId: "aafc8a5a-3b92-40ff-ae7a-a5e6dce2624b",
  memberships: [] as { familyId: string; role: "admin" | "adult" | "child" | "elderly" }[],
};

function buildApp(overrides: {
  verify?: (token: string) => Promise<{ authUserId: string }>;
  findFirst?: () => Promise<typeof USER | null>;
}) {
  const prisma = {
    user: { findFirst: overrides.findFirst ?? (() => Promise.resolve(USER)) },
  } as unknown as Parameters<typeof createAuthMiddleware>[0]["prisma"];

  const app = express();
  app.use(
    createAuthMiddleware({
      verify: overrides.verify ?? (() => Promise.resolve({ authUserId: USER.authUserId })),
      prisma,
    }),
  );
  app.get("/probe", (req, res) => {
    res.status(200).json({ user: req.user });
  });
  return app;
}

describe("createAuthMiddleware", () => {
  it("attaches the resolved user for a valid token", async () => {
    const response = await request(buildApp({})).get("/probe").set("Authorization", "Bearer good");

    expect(response.status).toBe(200);
    const body = response.body as ProbeBody;
    expect(body.user).toMatchObject({ id: USER.id, authUserId: USER.authUserId });
  });

  it("attaches familyId and role when the user has an active membership", async () => {
    const withMembership = {
      ...USER,
      memberships: [{ familyId: "fam-1", role: "admin" as const }],
    };
    const response = await request(buildApp({ findFirst: () => Promise.resolve(withMembership) }))
      .get("/probe")
      .set("Authorization", "Bearer good");

    const body = response.body as ProbeBody;
    expect(body.user).toMatchObject({ familyId: "fam-1", role: "admin" });
  });

  it("returns 401 UNAUTHENTICATED when the header is missing", async () => {
    const response = await request(buildApp({})).get("/probe");

    expect(response.status).toBe(401);
    const body = response.body as ProbeBody;
    expect(body.error?.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 when the scheme is not Bearer", async () => {
    const response = await request(buildApp({})).get("/probe").set("Authorization", "Basic abc");

    expect(response.status).toBe(401);
  });

  it("returns 401 when the token is invalid", async () => {
    const verify = () => Promise.reject(new InvalidTokenError("expired"));
    const response = await request(buildApp({ verify }))
      .get("/probe")
      .set("Authorization", "Bearer bad");

    expect(response.status).toBe(401);
    const body = response.body as ProbeBody;
    expect(body.error?.code).toBe("UNAUTHENTICATED");
  });

  it("never leaks the rejection reason or the token", async () => {
    const verify = () => Promise.reject(new InvalidTokenError("signature verification failed"));
    const response = await request(buildApp({ verify }))
      .get("/probe")
      .set("Authorization", "Bearer super-secret-token");

    const body = JSON.stringify(response.body);
    expect(body).not.toContain("signature");
    expect(body).not.toContain("super-secret-token");
  });

  it("returns 403 REGISTRATION_REQUIRED when no user row exists", async () => {
    const response = await request(buildApp({ findFirst: () => Promise.resolve(null) }))
      .get("/probe")
      .set("Authorization", "Bearer good");

    expect(response.status).toBe(403);
    const body = response.body as ProbeBody;
    expect(body.error?.code).toBe("REGISTRATION_REQUIRED");
  });
});
