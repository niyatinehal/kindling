/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("../../../../src/api/upstream", () => ({
  callApi: jest.fn(),
}));

import { callApi } from "../../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../../src/supabase/server";
import { POST } from "../route";

const mockCallApi = callApi as jest.MockedFunction<typeof callApi>;

function signedIn() {
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({
    auth: {
      getSession: jest.fn(() =>
        Promise.resolve({ data: { session: { access_token: "the-access-token" } } }),
      ),
    },
  });
}

function signedOut() {
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({
    auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null } })) },
  });
}

function request(body: string) {
  return new NextRequest("http://localhost/api/register", { method: "POST", body });
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/register", () => {
  it("passes a 201 through with its body", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ id: "user-1", status: "ACTIVE" }, 201));

    const response = await POST(request(JSON.stringify({ consent: true })));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "user-1", status: "ACTIVE" });
  });

  it("forwards the caller's body upstream", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ id: "user-1" }, 201));

    await POST(request(JSON.stringify({ consent: true, displayName: "Asha" })));

    expect(mockCallApi).toHaveBeenCalledWith("/api/v1/auth/register", "the-access-token", {
      method: "POST",
      body: { consent: true, displayName: "Asha" },
    });
  });

  it("passes an upstream 403 through with status and body intact", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ error: { code: "FORBIDDEN_ROLE" } }, 403));

    const response = await POST(request(JSON.stringify({ consent: true })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "FORBIDDEN_ROLE" } });
  });

  it("answers 401 without calling upstream when there is no session", async () => {
    signedOut();

    const response = await POST(request(JSON.stringify({ consent: true })));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("answers 400 with an envelope when the caller's body is not JSON", async () => {
    signedIn();

    const response = await POST(request("not json at all"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "VALIDATION_FAILED" } });
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("answers 502 with an envelope when the upstream call rejects", async () => {
    signedIn();
    mockCallApi.mockRejectedValue(new Error("fetch failed"));

    const response = await POST(request(JSON.stringify({ consent: true })));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "UPSTREAM_UNAVAILABLE" } });
  });

  it("answers 502 with an envelope when upstream returns a non-JSON body", async () => {
    signedIn();
    // An ingress in front of Express answering with its own HTML error page.
    mockCallApi.mockResolvedValue(
      new Response("<html><body>502 Bad Gateway</body></html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    );

    const response = await POST(request(JSON.stringify({ consent: true })));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "UPSTREAM_UNAVAILABLE" } });
  });
});
