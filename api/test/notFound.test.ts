import { describe, expect, it } from "@jest/globals";
import request from "supertest";

import { createApp } from "../src/app.js";
import { rulesPlanGenerator } from "../src/workouts/planGenerator.js";

/**
 * An unmatched path used to fall through to Express's default finalhandler,
 * which answers `Cannot GET /whatever` as text/html. Nothing crashed, but the
 * web app's `proxyUpstream` checks content-type before it parses: HTML from
 * upstream is indistinguishable to it from a dead upstream, so it returned
 * UPSTREAM_UNAVAILABLE and the person was told the server could not be
 * reached. A mistyped path and an outage read identically in the logs.
 *
 * So the content type matters here as much as the status does, and both are
 * asserted.
 */
function app() {
  return createApp({
    checkDatabase: () => Promise.resolve(),
    prisma: {} as unknown as Parameters<typeof createApp>[0]["prisma"],
    planGenerator: rulesPlanGenerator,
    verify: () => Promise.reject(new Error("not reached")),
  });
}

describe("unmatched routes", () => {
  it("answers with the same envelope every other failure uses", async () => {
    const response = await request(app()).get("/api/v1/nope");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
  });

  it("answers as JSON, which is what stops it reading as an unreachable upstream", async () => {
    const response = await request(app()).get("/api/v1/nope");

    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });

  it("covers every method, not just GET", async () => {
    const response = await request(app()).post("/api/v1/nope").send({});

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
  });

  /*
    The path is deliberately not echoed back. Express's default put it in the
    body, and a 404 is the one response an attacker can put arbitrary text
    into — worth nothing on its own, worth something the moment a client
    renders a message it was handed.
  */
  it("does not echo the requested path back to the caller", async () => {
    const path = "/api/v1/<script>alert(1)</script>";
    const response = await request(app()).get(path);

    expect(JSON.stringify(response.body)).not.toContain("script");
  });

  it("still lets a route that does exist answer normally", async () => {
    const response = await request(app()).get("/healthz");

    expect(response.status).toBe(200);
  });
});
