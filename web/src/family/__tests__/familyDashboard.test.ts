/**
 * @jest-environment node
 */
jest.mock("../../supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("../../api/upstream", () => ({
  callApi: jest.fn(),
}));

import { callApi } from "../../api/upstream";
import { createSupabaseServerClient } from "../../supabase/server";
import { familyDashboard } from "../familyDashboard";

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

describe("familyDashboard", () => {
  it("resolves the family from the session, then asks for its dashboard", async () => {
    signedIn();
    mockCallApi
      .mockResolvedValueOnce(json({ family: { id: "fam-1", role: "admin" } }, 200))
      .mockResolvedValueOnce(json({ members: [{ user_id: "u1", display_name: "Sunita" }] }, 200));

    expect(await familyDashboard()).toMatchObject([{ display_name: "Sunita" }]);
    // The family id comes from the server's answer, never from the browser: a
    // client cannot even form a request for a family it does not administer.
    expect(mockCallApi).toHaveBeenLastCalledWith(
      "/api/v1/families/fam-1/dashboard",
      "the-access-token",
    );
  });

  it("is null for a member who is not the admin, without asking upstream", async () => {
    signedIn();
    mockCallApi.mockResolvedValueOnce(json({ family: { id: "fam-1", role: "adult" } }, 200));

    expect(await familyDashboard()).toBeNull();
    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("is null for someone in no family at all", async () => {
    signedIn();
    mockCallApi.mockResolvedValueOnce(json({ family: null }, 200));

    expect(await familyDashboard()).toBeNull();
    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("is null rather than throwing when the API is unreachable", async () => {
    signedIn();
    mockCallApi.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3000"));

    expect(await familyDashboard()).toBeNull();
  });

  // A 403 from the endpoint is the API enforcing the same rule the UI does. The
  // screen must render its explanation, not crash.
  it("is null when the API refuses the request", async () => {
    signedIn();
    mockCallApi
      .mockResolvedValueOnce(json({ family: { id: "fam-1", role: "admin" } }, 200))
      .mockResolvedValueOnce(json({ error: { code: "FORBIDDEN_ROLE" } }, 403));

    expect(await familyDashboard()).toBeNull();
  });
});
