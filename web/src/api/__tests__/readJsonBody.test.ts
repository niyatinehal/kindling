/**
 * @jest-environment node
 */
import { readJsonBody } from "../readJsonBody";

describe("readJsonBody", () => {
  it("returns the parsed body when there is one", async () => {
    const response = new Response(JSON.stringify({ error: { code: "VALIDATION_FAILED" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

    await expect(readJsonBody(response)).resolves.toEqual({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  // `proxyUpstream` deliberately emits a bodiless response for an empty
  // upstream body and for 204/304. A blind `.json()` rejects on those, and an
  // unhandled rejection inside a click handler leaves the screen hung with no
  // error at all — the exact failure the proxy was fixed to avoid.
  it("returns an empty object for a bodiless response instead of throwing", async () => {
    await expect(readJsonBody(new Response(null, { status: 204 }))).resolves.toEqual({});
  });

  it("returns an empty object when the body is not JSON", async () => {
    const response = new Response("<!DOCTYPE html><p>502 Bad Gateway</p>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });

    await expect(readJsonBody(response)).resolves.toEqual({});
  });
});
