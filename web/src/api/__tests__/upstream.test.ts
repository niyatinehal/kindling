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

  it("sends raw bytes with their own content type, still with the Bearer header", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer;

    await callApi("/api/v1/meals/parse-photo", "the-access-token", {
      method: "POST",
      raw: { bytes, contentType: "image/jpeg" },
    });

    const headers = new Headers(captured?.init.headers);
    expect(headers.get("content-type")).toBe("image/jpeg");
    expect(headers.get("authorization")).toBe("Bearer the-access-token");
    expect(captured?.init.body).toBe(bytes);
  });

  it("never forwards a cookie header upstream", async () => {
    await callApi("/api/v1/auth/me", "the-access-token");

    const headers = new Headers(captured?.init.headers);
    expect(headers.get("cookie")).toBeNull();
  });

  // `${base}@evil.com/x` parses with "api.test" as userinfo and "evil.com" as
  // the host, and "//evil.com/x" is protocol-relative — either would post a
  // Bearer token to somewhere we never chose. Task 6+ builds paths from ids,
  // so the guard has to be in place before the first interpolated path lands.
  it.each(["@evil.com/x", "//evil.com/x", "api/v1/auth/me"])(
    "refuses the path %p rather than letting it choose the host",
    async (path) => {
      await expect(callApi(path, "the-access-token")).rejects.toThrow(/single "\/"/);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

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
