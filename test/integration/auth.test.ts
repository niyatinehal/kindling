import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { createPrismaClient, disconnect } from "../../src/db/prisma.js";
import { registerUser } from "../../src/services/registerUser.js";

const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);

beforeEach(async () => {
  await prisma.familyMembership.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await disconnect(prisma);
});

const input = () => ({
  authUserId: randomUUID(),
  email: "meera@example.test",
  displayName: "Meera",
  locale: "en" as const,
  consents: [{ consentType: "health_data" as const, policyVersion: "2026-08-14" }],
});

describe("registerUser", () => {
  it("creates the user and its consent rows in one call", async () => {
    const data = input();

    const user = await registerUser(prisma, data);

    expect(user.authUserId).toBe(data.authUserId);
    expect(user.displayName).toBe("Meera");

    const consents = await prisma.consentRecord.findMany({ where: { userId: user.id } });
    expect(consents).toHaveLength(1);
    expect(consents[0]?.consentType).toBe("health_data");
    expect(consents[0]?.grantedByUserId).toBe(user.id);
    expect(consents[0]?.policyVersion).toBe("2026-08-14");
  });

  it("is idempotent on authUserId and does not duplicate consents", async () => {
    const data = input();

    const first = await registerUser(prisma, data);
    const second = await registerUser(prisma, data);

    expect(second.id).toBe(first.id);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.consentRecord.count()).toBe(1);
  });

  it("keeps the original row and ignores changed fields on a repeat call", async () => {
    const data = input();

    const first = await registerUser(prisma, data);
    const second = await registerUser(prisma, {
      ...data,
      displayName: "Someone Else",
      consents: [
        ...data.consents,
        { consentType: "marketing_notifications" as const, policyVersion: "2026-08-14" },
      ],
    });

    expect(second.id).toBe(first.id);
    expect(second.displayName).toBe("Meera");
    expect(await prisma.consentRecord.count()).toBe(1);
  });

  it("rolls back the user when a consent row is invalid", async () => {
    const data = {
      ...input(),
      consents: [{ consentType: "health_data" as const, policyVersion: "" }],
    };

    await expect(registerUser(prisma, data)).rejects.toThrow();
    expect(await prisma.user.count()).toBe(0);
  });
});
