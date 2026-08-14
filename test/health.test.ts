import { describe, expect, it } from "@jest/globals";
import request from "supertest";

import { createApp } from "../src/app.js";

/**
 * Drives the app through `createApp()` rather than `server.ts`, so no port is
 * ever bound. That is the whole reason app/server are separate files.
 */
describe("GET /healthz", () => {
  it("responds 200 with a JSON status body", async () => {
    const response = await request(createApp({ checkDatabase: () => Promise.resolve() })).get(
      "/healthz",
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);

    const body = response.body as { status?: string; uptime?: number };
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });

  it("does not leak the Express fingerprint", async () => {
    const response = await request(createApp({ checkDatabase: () => Promise.resolve() })).get(
      "/healthz",
    );

    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
