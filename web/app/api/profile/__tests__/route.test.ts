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
import { GET, PUT } from "../route";

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

const putRequest = (body: unknown) =>
  new Request("http://localhost/api/profile", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validProfile = {
  birth_year: 1963,
  goal: "general_fitness",
  level: "beginner",
  space: "small_room",
  equipment: ["resistance_band"],
};

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /api/profile", () => {
  // Absence is a normal state, so it must arrive as a 200 the caller can read —
  // not as an error status the home screen would have to special-case.
  it("passes through a 200 with a null profile", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ profile: null }, 200));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile: null });
  });

  it("answers 401 without calling upstream when there is no session", async () => {
    signedOut();

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("answers 502 with an envelope when upstream is unreachable", async () => {
    signedIn();
    mockCallApi.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3000"));

    const response = await GET();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "UPSTREAM_UNAVAILABLE" } });
  });
});

describe("PUT /api/profile", () => {
  it("forwards the body upstream as a PUT and passes the answer back", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ profile: { level: "beginner" } }, 200));

    const response = await PUT(putRequest(validProfile));

    expect(response.status).toBe(200);
    expect(mockCallApi).toHaveBeenCalledWith("/api/v1/profiles/me", "the-access-token", {
      method: "PUT",
      body: validProfile,
    });
  });

  // Express owns the schema, so a rejection has to reach the form intact rather
  // than being flattened into a generic failure.
  it("passes a 400 VALIDATION_FAILED through with status and body intact", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(
      json({ error: { code: "VALIDATION_FAILED", message: "equipment cannot be empty" } }, 400),
    );

    const response = await PUT(putRequest({ ...validProfile, equipment: [] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_FAILED", message: "equipment cannot be empty" },
    });
  });

  it("answers 401 without calling upstream when there is no session", async () => {
    signedOut();

    const response = await PUT(putRequest(validProfile));

    expect(response.status).toBe(401);
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  // `request.json()` throws on a malformed body. This handler's contract, like
  // every other one here, is to always answer with something parsable.
  it("answers 400 rather than throwing on an unreadable body", async () => {
    signedIn();
    const broken = new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });

    const response = await PUT(broken);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "VALIDATION_FAILED" } });
    expect(mockCallApi).not.toHaveBeenCalled();
  });
});
