/**
 * @jest-environment node
 */
jest.mock("../../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("../../../../../src/api/upstream", () => ({
  callApi: jest.fn(),
}));

import { callApi } from "../../../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../../../src/supabase/server";
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

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const post = (body: string) =>
  POST(new Request("http://localhost/api/meals/parse", { method: "POST", body }));

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/meals/parse", () => {
  it("forwards the text to parse-pantry and passes the answer through", async () => {
    signedIn();
    const parsed = {
      recognised: ["potato"],
      unrecognised: ["maggi"],
      source: "synonyms",
      degraded: false,
      parser: "synonyms@1",
    };
    mockCallApi.mockResolvedValue(json(parsed, 200));

    const response = await post(JSON.stringify({ text: "aloo, maggi" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(parsed);
    expect(mockCallApi).toHaveBeenCalledWith("/api/v1/meals/parse-pantry", "the-access-token", {
      method: "POST",
      body: { text: "aloo, maggi" },
    });
  });

  it("passes a 400 through with its envelope", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(
      json({ error: { code: "VALIDATION_FAILED", message: "Too small" } }, 400),
    );

    const response = await post(JSON.stringify({ text: "" }));

    expect(response.status).toBe(400);
  });

  it("answers 401 without calling upstream when there is no session", async () => {
    signedOut();

    const response = await post(JSON.stringify({ text: "aloo" }));

    expect(response.status).toBe(401);
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("answers 400 without calling upstream when the body is not JSON", async () => {
    signedIn();

    const response = await post("not json");

    expect(response.status).toBe(400);
    expect(mockCallApi).not.toHaveBeenCalled();
  });
});
