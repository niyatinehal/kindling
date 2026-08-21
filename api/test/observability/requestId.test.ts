import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import express from "express";

import { requestId } from "../../src/observability/requestId.js";

function appWith() {
  const app = express();
  app.use(requestId());
  app.get("/echo", (req, res) => {
    res.status(200).json({ seen: req.requestId });
  });
  return app;
}

describe("requestId", () => {
  /*
    The point of echoing it: somebody reports "it broke around three o'clock",
    and without a shared handle the only way to find their failure is to guess
    from timestamps. With one, they can read it off the response and it matches
    a row exactly — without the error table having to know who they are.
  */
  it("echoes the id it assigned back to the caller", async () => {
    const response = await request(appWith()).get("/echo");

    const header = response.headers["x-request-id"];
    expect(header).toBeTruthy();
    expect((response.body as { seen?: string }).seen).toBe(header);
  });

  it("gives every request its own", async () => {
    const app = appWith();
    const first = await request(app).get("/echo");
    const second = await request(app).get("/echo");

    expect(first.headers["x-request-id"]).not.toBe(second.headers["x-request-id"]);
  });

  // Vercel and Render both put one on the request already. Keeping theirs means
  // a trace can be followed across the proxy rather than restarting at our door.
  it("keeps an id the caller already supplied", async () => {
    const response = await request(appWith()).get("/echo").set("x-request-id", "from-upstream");

    expect(response.headers["x-request-id"]).toBe("from-upstream");
  });

  // A header is caller-controlled, so it lands in a database column and a log
  // line. Unbounded, it is a way to write whatever you like into both.
  it("refuses a supplied id that is not a plausible one", async () => {
    const response = await request(appWith()).get("/echo").set("x-request-id", "x".repeat(500));

    expect(response.headers["x-request-id"]).not.toContain("xxxxx");
  });
});
