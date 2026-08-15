/**
 * @jest-environment node
 */
import { callApi } from "../upstream";

const originalFetch = global.fetch;
let captured: { url: string; init: RequestInit } | null = null;

beforeEach(() => {
  captured = null;
  process.env["API_BASE_URL"] = "http://api.test";
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = "http://127.0.0.1:54321";
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "anon";
  global.fetch = jest.fn((url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init: init ?? {} };
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("callApi", () => {
  it("attaches the access token as a Bearer header", async () => {
    await callApi("/api/v1/auth/me", "the-access-token");

    const headers = new Headers(captured?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer the-access-token");
  });

  it("never forwards a cookie header upstream", async () => {
    await callApi("/api/v1/auth/me", "the-access-token");

    const headers = new Headers(captured?.init.headers);
    expect(headers.get("cookie")).toBeNull();
  });

  it("preserves the upstream status rather than flattening it", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: "REGISTRATION_REQUIRED" } }), { status: 403 }),
      ),
    ) as unknown as typeof fetch;

    const response = await callApi("/api/v1/auth/me", "the-access-token");

    expect(response.status).toBe(403);
  });
});
