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
import { currentProfile } from "../currentProfile";

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

describe("currentProfile", () => {
  it("returns the stored profile so the form can open pre-filled", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ profile: { birth_year: 1963, goal: "mobility" } }, 200));

    expect(await currentProfile()).toMatchObject({ birth_year: 1963, goal: "mobility" });
  });

  it("is null before intake, which renders an empty form", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ profile: null }, 200));

    expect(await currentProfile()).toBeNull();
  });

  // A failure here costs the pre-fill, never the data: the form still requires
  // every mandatory answer before it will submit.
  it("is null rather than throwing when the API is unreachable", async () => {
    signedIn();
    mockCallApi.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3000"));

    expect(await currentProfile()).toBeNull();
  });

  it("is null when there is no session to authenticate with", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue({
      auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null } })) },
    });

    expect(await currentProfile()).toBeNull();
    expect(mockCallApi).not.toHaveBeenCalled();
  });
});
