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

/** A registered user, ready to create or join a family. */
const member = async (displayName: string): Promise<string> => {
  const token = await tokenFor(randomUUID());
  await request(app)
    .post("/api/v1/auth/register")
    .set("Authorization", `Bearer ${token}`)
    .send({
      display_name: displayName,
      locale: "en",
      consents: [{ consent_type: "health_data", policy_version: "2026-08-14" }],
    });
  return token;
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type ErrorBody = { error?: { code?: string } };
type FamilyBody = { family?: { id?: string; name?: string; role?: string } };
type InviteBody = { invite?: { code?: string; invited_role?: string; expires_at?: string } };
type MembersBody = { members?: { user_id: string; display_name: string; role: string }[] };

/** Creates a family with `token` as admin and returns its id. */
const familyFor = async (token: string, name = "The Nehals"): Promise<string> => {
  const response = await request(app).post("/api/v1/families").set(auth(token)).send({ name });
  return (response.body as FamilyBody).family?.id as string;
};

const inviteFor = async (token: string, familyId: string, role = "elderly"): Promise<string> => {
  const response = await request(app)
    .post(`/api/v1/families/${familyId}/invites`)
    .set(auth(token))
    .send({ invited_role: role });
  return (response.body as InviteBody).invite?.code as string;
};

describe("POST /api/v1/families", () => {
  it("creates the family and makes the caller its admin", async () => {
    const meera = await member("Meera");

    const response = await request(app)
      .post("/api/v1/families")
      .set(auth(meera))
      .send({ name: "The Nehals" });

    expect(response.status).toBe(201);
    expect((response.body as FamilyBody).family).toMatchObject({
      name: "The Nehals",
      role: "admin",
    });
  });

  // The design doc requires visibility rows exist eagerly: a membership without
  // them leaves a dashboard query undefined, and there is no fallback read.
  it("creates every visibility row in the same breath as the membership", async () => {
    const meera = await member("Meera");
    await familyFor(meera);

    const settings = await prisma.visibilitySetting.findMany();
    expect(settings).toHaveLength(7);
    expect(settings.filter((s) => s.visibility === "visible").map((s) => s.dataCategory)).toEqual([
      "adherence_summary",
    ]);
  });

  it("refuses a second family with ALREADY_IN_FAMILY", async () => {
    const meera = await member("Meera");
    await familyFor(meera);

    const response = await request(app)
      .post("/api/v1/families")
      .set(auth(meera))
      .send({ name: "Another" });

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error?.code).toBe("ALREADY_IN_FAMILY");
    expect(await prisma.family.count()).toBe(1);
  });

  it("returns 403 REGISTRATION_REQUIRED for a token with no domain user", async () => {
    const token = await tokenFor(randomUUID());

    const response = await request(app)
      .post("/api/v1/families")
      .set(auth(token))
      .send({ name: "X" });

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error?.code).toBe("REGISTRATION_REQUIRED");
  });
});

describe("invites", () => {
  it("lets an admin invite and an invitee join with the invited role", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const code = await inviteFor(meera, familyId, "elderly");

    const ramesh = await member("Ramesh");
    const response = await request(app).post(`/api/v1/invites/${code}/accept`).set(auth(ramesh));

    expect(response.status).toBe(200);
    expect((response.body as FamilyBody).family).toMatchObject({ id: familyId, role: "elderly" });
  });

  it("gives the joiner their own visibility rows, floor-locked for elderly", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const code = await inviteFor(meera, familyId, "elderly");
    const ramesh = await member("Ramesh");
    await request(app).post(`/api/v1/invites/${code}/accept`).set(auth(ramesh));

    const settings = await prisma.visibilitySetting.findMany({
      where: { membership: { user: { displayName: "Ramesh" } } },
    });

    expect(settings).toHaveLength(7);
    expect(
      settings.find((s) => s.dataCategory === "adherence_summary")?.isLockedBySafetyFloor,
    ).toBe(true);
  });

  // Single use is enforced by the status transition, not by a sweeper.
  it("burns the code on use, so a second redemption is refused", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const code = await inviteFor(meera, familyId);

    const first = await request(app)
      .post(`/api/v1/invites/${code}/accept`)
      .set(auth(await member("Ramesh")));
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/v1/invites/${code}/accept`)
      .set(auth(await member("Arjun")));

    expect(second.status).toBe(410);
    expect((second.body as ErrorBody).error?.code).toBe("INVITE_EXPIRED");
  });

  // A wrong code and a used code must be indistinguishable, or the endpoint
  // becomes a way to discover which codes exist.
  it("answers a nonsense code exactly as it answers a spent one", async () => {
    const response = await request(app)
      .post("/api/v1/invites/NOTACODE99/accept")
      .set(auth(await member("Stranger")));

    expect(response.status).toBe(410);
    expect((response.body as ErrorBody).error?.code).toBe("INVITE_EXPIRED");
  });

  it("refuses an expired code and marks it expired", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const code = await inviteFor(meera, familyId);
    await prisma.familyInvite.updateMany({
      where: { inviteCode: code },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app)
      .post(`/api/v1/invites/${code}/accept`)
      .set(auth(await member("Ramesh")));

    expect(response.status).toBe(410);
    expect((await prisma.familyInvite.findUnique({ where: { inviteCode: code } }))?.status).toBe(
      "expired",
    );
  });

  it("refuses to let someone already in a family accept an invite", async () => {
    const meera = await member("Meera");
    const familyA = await familyFor(meera);
    const code = await inviteFor(meera, familyA);

    const priya = await member("Priya");
    await familyFor(priya, "The Sharmas");

    const response = await request(app).post(`/api/v1/invites/${code}/accept`).set(auth(priya));

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error?.code).toBe("ALREADY_IN_FAMILY");
  });

  // `admin` is not in InvitableRole, so this cannot even be expressed in the DB.
  it("rejects an attempt to invite someone straight to admin", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);

    const response = await request(app)
      .post(`/api/v1/families/${familyId}/invites`)
      .set(auth(meera))
      .send({ invited_role: "admin" });

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error?.code).toBe("VALIDATION_FAILED");
  });
});

describe("RBAC", () => {
  it("refuses a non-admin issuing invites", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const arjun = await member("Arjun");
    await request(app)
      .post(`/api/v1/invites/${await inviteFor(meera, familyId, "child")}/accept`)
      .set(auth(arjun));

    const response = await request(app)
      .post(`/api/v1/families/${familyId}/invites`)
      .set(auth(arjun))
      .send({ invited_role: "adult" });

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error?.code).toBe("FORBIDDEN_ROLE");
  });

  it("tells a caller with no family apart from one with the wrong role", async () => {
    const loner = await member("Loner");

    const response = await request(app)
      .post(`/api/v1/families/${randomUUID()}/invites`)
      .set(auth(loner))
      .send({ invited_role: "adult" });

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error?.code).toBe("NOT_IN_FAMILY");
  });

  // The check `requireRole` cannot make: being an admin somewhere is not being
  // an admin HERE. Without it, one family's admin could administer another's.
  it("stops an admin of one family administering another", async () => {
    const meera = await member("Meera");
    const familyA = await familyFor(meera, "The Nehals");
    const priya = await member("Priya");
    const familyB = await familyFor(priya, "The Sharmas");

    const response = await request(app)
      .post(`/api/v1/families/${familyB}/invites`)
      .set(auth(meera))
      .send({ invited_role: "adult" });

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error?.code).toBe("FORBIDDEN_ROLE");
    expect(await prisma.familyInvite.count({ where: { familyId: familyA } })).toBe(0);
  });

  it("lets any member list the family, including a child", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const arjun = await member("Arjun");
    await request(app)
      .post(`/api/v1/invites/${await inviteFor(meera, familyId, "child")}/accept`)
      .set(auth(arjun));

    const response = await request(app)
      .get(`/api/v1/families/${familyId}/members`)
      .set(auth(arjun));

    expect(response.status).toBe(200);
    const names = ((response.body as MembersBody).members ?? []).map((m) => m.display_name);
    expect(names).toContain("Meera");
    expect(names).toContain("Arjun");
  });
});

describe("membership management", () => {
  it("lets an admin promote a member", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const priya = await member("Priya");
    await request(app)
      .post(`/api/v1/invites/${await inviteFor(meera, familyId, "adult")}/accept`)
      .set(auth(priya));
    const priyaId = (await prisma.user.findFirstOrThrow({ where: { displayName: "Priya" } })).id;

    const response = await request(app)
      .patch(`/api/v1/families/${familyId}/members/${priyaId}/role`)
      .set(auth(meera))
      .send({ role: "admin" });

    expect(response.status).toBe(204);
    expect(
      (await prisma.familyMembership.findFirstOrThrow({ where: { userId: priyaId } })).role,
    ).toBe("admin");
  });

  // Without this an admin can demote themselves and lock the family out of its
  // own administration — every route that could undo it is admin-guarded.
  it("refuses to demote the last admin", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const meeraId = (await prisma.user.findFirstOrThrow({ where: { displayName: "Meera" } })).id;

    const response = await request(app)
      .patch(`/api/v1/families/${familyId}/members/${meeraId}/role`)
      .set(auth(meera))
      .send({ role: "adult" });

    expect(response.status).toBe(409);
    expect(
      (await prisma.familyMembership.findFirstOrThrow({ where: { userId: meeraId } })).role,
    ).toBe("admin");
  });

  it("removes a member by status, never by deletion", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const arjun = await member("Arjun");
    await request(app)
      .post(`/api/v1/invites/${await inviteFor(meera, familyId, "child")}/accept`)
      .set(auth(arjun));
    const arjunId = (await prisma.user.findFirstOrThrow({ where: { displayName: "Arjun" } })).id;

    const response = await request(app)
      .delete(`/api/v1/families/${familyId}/members/${arjunId}`)
      .set(auth(meera));

    expect(response.status).toBe(204);
    const membership = await prisma.familyMembership.findFirstOrThrow({
      where: { userId: arjunId },
    });
    expect(membership.status).toBe("removed");
  });

  // A removed member must lose access on the very next request — the middleware
  // resolves role from the database, not from the token.
  it("cuts off a removed member immediately", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const arjun = await member("Arjun");
    await request(app)
      .post(`/api/v1/invites/${await inviteFor(meera, familyId, "child")}/accept`)
      .set(auth(arjun));
    const arjunId = (await prisma.user.findFirstOrThrow({ where: { displayName: "Arjun" } })).id;
    await request(app).delete(`/api/v1/families/${familyId}/members/${arjunId}`).set(auth(meera));

    const response = await request(app)
      .get(`/api/v1/families/${familyId}/members`)
      .set(auth(arjun));

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error?.code).toBe("NOT_IN_FAMILY");
  });

  it("lets a removed member join a family again", async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const arjun = await member("Arjun");
    await request(app)
      .post(`/api/v1/invites/${await inviteFor(meera, familyId, "child")}/accept`)
      .set(auth(arjun));
    const arjunId = (await prisma.user.findFirstOrThrow({ where: { displayName: "Arjun" } })).id;
    await request(app).delete(`/api/v1/families/${familyId}/members/${arjunId}`).set(auth(meera));

    const fresh = await inviteFor(meera, familyId, "adult");
    const response = await request(app).post(`/api/v1/invites/${fresh}/accept`).set(auth(arjun));

    expect(response.status).toBe(200);
  });
});

// FR-FAM-1 plus §17's structural bar: the dashboard filters at the data layer, and
// being the admin grants the view, never the right to read a hidden category.
describe("GET /api/v1/families/:id/dashboard", () => {
  /** Meera as admin with Ramesh (elderly) joined; returns both tokens. */
  const familyOfTwo = async () => {
    const meera = await member("Meera");
    const familyId = await familyFor(meera);
    const ramesh = await member("Ramesh");
    await request(app)
      .post(`/api/v1/invites/${await inviteFor(meera, familyId, "elderly")}/accept`)
      .set(auth(ramesh));
    return { meera, ramesh, familyId };
  };

  type Panel = {
    display_name: string;
    role: string;
    shared: string[];
    adherence_summary?: { days_logged: number };
    water?: { water_ml: number };
    sleep?: unknown;
    workout_detail?: unknown;
    meal_detail?: unknown;
  };
  type DashboardBody = { members?: Panel[] };

  it("lists every active member", async () => {
    const { meera, familyId } = await familyOfTwo();

    const response = await request(app)
      .get(`/api/v1/families/${familyId}/dashboard`)
      .set(auth(meera));

    expect(response.status).toBe(200);
    const names = ((response.body as DashboardBody).members ?? []).map((m) => m.display_name);
    expect(names).toEqual(expect.arrayContaining(["Meera", "Ramesh"]));
  });

  // The default is engagement only: "did they log anything", nothing about what.
  it("shows another member's adherence but not their detail", async () => {
    const { meera, familyId } = await familyOfTwo();

    const response = await request(app)
      .get(`/api/v1/families/${familyId}/dashboard`)
      .set(auth(meera));

    const ramesh = (response.body as DashboardBody).members?.find(
      (m) => m.display_name === "Ramesh",
    );
    expect(ramesh?.adherence_summary).toBeDefined();
    expect(ramesh?.shared).toEqual(["adherence_summary"]);
  });

  // Absent, not present-and-null. A null field would tell the admin "there is a
  // number here you may not see", which is itself a disclosure.
  it("omits hidden categories entirely rather than nulling them", async () => {
    const { meera, familyId } = await familyOfTwo();

    const response = await request(app)
      .get(`/api/v1/families/${familyId}/dashboard`)
      .set(auth(meera));

    const ramesh = (response.body as DashboardBody).members?.find(
      (m) => m.display_name === "Ramesh",
    );
    expect(ramesh).not.toHaveProperty("water");
    expect(ramesh).not.toHaveProperty("sleep");
    expect(ramesh).not.toHaveProperty("workout_detail");
    expect(ramesh).not.toHaveProperty("meal_detail");
  });

  // The trust model PRD §12 is explicit about: an admin does not override hidden.
  it("still hides a category from the admin after the member logs data in it", async () => {
    const { meera, ramesh, familyId } = await familyOfTwo();
    await request(app)
      .post("/api/v1/tracking/logs")
      .set(auth(ramesh))
      .send({ type: "water", logged_for: new Date().toISOString().slice(0, 10), value: 500 });

    const response = await request(app)
      .get(`/api/v1/families/${familyId}/dashboard`)
      .set(auth(meera));

    const panel = (response.body as DashboardBody).members?.find(
      (m) => m.display_name === "Ramesh",
    );
    expect(panel).not.toHaveProperty("water");
    // The coarse signal still moves — that is the whole point of the floor.
    expect(panel?.adherence_summary?.days_logged).toBe(1);
  });

  // Hiding your own data from yourself is meaningless and would look broken.
  it("shows the viewer their own row in full", async () => {
    const { meera, familyId } = await familyOfTwo();
    await request(app)
      .post("/api/v1/tracking/logs")
      .set(auth(meera))
      .send({ type: "water", logged_for: new Date().toISOString().slice(0, 10), value: 750 });

    const response = await request(app)
      .get(`/api/v1/families/${familyId}/dashboard`)
      .set(auth(meera));

    const own = (response.body as DashboardBody).members?.find((m) => m.display_name === "Meera");
    expect(own?.water?.water_ml).toBe(750);
    expect(own?.sleep).toBeDefined();
  });

  it("reveals a category once the member shares it", async () => {
    const { meera, familyId } = await familyOfTwo();
    await prisma.visibilitySetting.updateMany({
      where: {
        dataCategory: "water",
        membership: { user: { displayName: "Ramesh" } },
      },
      data: { visibility: "visible" },
    });

    const response = await request(app)
      .get(`/api/v1/families/${familyId}/dashboard`)
      .set(auth(meera));

    const panel = (response.body as DashboardBody).members?.find(
      (m) => m.display_name === "Ramesh",
    );
    expect(panel?.water).toBeDefined();
    expect(panel?.shared).toEqual(expect.arrayContaining(["adherence_summary", "water"]));
  });

  it("refuses a non-admin member", async () => {
    const { ramesh, familyId } = await familyOfTwo();

    const response = await request(app)
      .get(`/api/v1/families/${familyId}/dashboard`)
      .set(auth(ramesh));

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error?.code).toBe("FORBIDDEN_ROLE");
  });

  it("refuses an admin of a different family", async () => {
    const { familyId } = await familyOfTwo();
    const priya = await member("Priya");
    await familyFor(priya, "The Sharmas");

    const response = await request(app)
      .get(`/api/v1/families/${familyId}/dashboard`)
      .set(auth(priya));

    expect(response.status).toBe(403);
  });
});
