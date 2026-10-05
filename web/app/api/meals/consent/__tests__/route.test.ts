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

const put = (body: string) =>
  PUT(new Request("http://localhost/api/meals/consent", { method: "PUT", body }));

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("/api/meals/consent", () => {
  it("reads the toggle's state", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ enabled: false, available: true }, 200));

    const response = await GET();

    expect(await response.json()).toEqual({ enabled: false, available: true });
    expect(mockCallApi).toHaveBeenCalledWith("/api/v1/meals/pantry-consent", "the-access-token");
  });

  it("forwards a change and passes a refusal through intact", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ error: { code: "FORBIDDEN_ROLE", message: "no" } }, 403));

    const response = await put(JSON.stringify({ enabled: true }));

    expect(response.status).toBe(403);
    expect(mockCallApi).toHaveBeenCalledWith("/api/v1/meals/pantry-consent", "the-access-token", {
      method: "PUT",
      body: { enabled: true },
    });
  });

  it("answers 401 without calling upstream when there is no session", async () => {
    signedOut();

    expect((await GET()).status).toBe(401);
    expect((await put(JSON.stringify({ enabled: true }))).status).toBe(401);
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("answers 400 without calling upstream when the body is not JSON", async () => {
    signedIn();

    expect((await put("nope")).status).toBe(400);
    expect(mockCallApi).not.toHaveBeenCalled();
  });
});
