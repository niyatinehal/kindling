import { describe, expect, it } from "@jest/globals";
import request from "supertest";

import { createApp } from "../src/app.js";

const deps = {
  checkDatabase: () => Promise.resolve(),
  prisma: {} as unknown as Parameters<typeof createApp>[0]["prisma"],
  verify: () => Promise.resolve({ authUserId: "unused" }),
};

const ready = () => createApp({ ...deps, checkDatabase: () => Promise.resolve() });
const broken = () =>
  createApp({
    ...deps,
    checkDatabase: () =>
      Promise.reject(new Error("connection refused to postgres://user:SECRET@host/db")),
  });

describe("GET /readyz", () => {
  it("returns 200 when the database answers", async () => {
    const response = await request(ready()).get("/readyz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ready", checks: { database: "up" } });
  });

  it("returns 503 when the database does not answer", async () => {
    const response = await request(broken()).get("/readyz");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "not_ready", checks: { database: "down" } });
  });

  it("never leaks the connection string into the response", async () => {
    const response = await request(broken()).get("/readyz");

    expect(JSON.stringify(response.body)).not.toContain("SECRET");
  });
});

describe("GET /healthz", () => {
  it("still returns 200 when the database is down", async () => {
    const response = await request(broken()).get("/healthz");

    expect(response.status).toBe(200);
  });
});
