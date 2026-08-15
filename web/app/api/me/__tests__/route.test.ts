/**
 * @jest-environment node
 */
jest.mock("../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("../../../../src/api/upstream", () => ({
  callApi: jest.fn(),
}));

import { callApi } from "../../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../../src/supabase/server";
import { GET } from "../route";

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

describe("GET /api/me", () => {
  it("passes a 200 through with its body", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ status: "ACTIVE", role: "PARENT" }, 200));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ACTIVE", role: "PARENT" });
  });

  // The one that must never regress. 403 REGISTRATION_REQUIRED is the normal
  // first answer for a brand-new account, not an error; if this collapses to a
  // 500 or a 200, every new user is stranded on a screen that cannot route.
  it("passes a 403 REGISTRATION_REQUIRED through with status and body intact", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(
      json({ error: { code: "REGISTRATION_REQUIRED", message: "register first" } }, 403),
    );

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "REGISTRATION_REQUIRED", message: "register first" },
    });
  });

  it("answers 401 without calling upstream when there is no session", async () => {
    signedOut();

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("answers 502 with an envelope when the upstream call rejects", async () => {
    signedIn();
    mockCallApi.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3000"));

    const response = await GET();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "UPSTREAM_UNAVAILABLE" } });
  });

  it("never returns the underlying failure reason to the caller", async () => {
    signedIn();
    mockCallApi.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3000"));

    const response = await GET();

    expect(JSON.stringify(await response.json())).not.toContain("ECONNREFUSED");
  });

  it("answers 502 with an envelope when upstream returns a non-JSON body", async () => {
    signedIn();
    // What Express itself sends for a path miss: `finalhandler` has no
    // catch-all 404 to hit, so it writes text/html.
    mockCallApi.mockResolvedValue(
      new Response("<!DOCTYPE html><p>Cannot GET /api/v1/auth/me</p>", {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const response = await GET();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "UPSTREAM_UNAVAILABLE" } });
  });

  it("passes an empty body through rather than throwing on a blind .json()", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(
      new Response("", { status: 200, headers: { "content-type": "application/json" } }),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it("passes a 204 through instead of building an invalid response", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await GET();

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });
});
