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
import { hasFamily } from "../hasFamily";

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

describe("hasFamily", () => {
  it("is true when the API reports a family", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ family: { id: "fam-1", role: "admin" } }, 200));

    expect(await hasFamily()).toBe(true);
  });

  it("is false when the API reports none", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ family: null }, 200));

    expect(await hasFamily()).toBe(false);
  });

  it("only asks the one endpoint that knows", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ family: { id: "fam-1", role: "admin" } }, 200));

    await hasFamily();

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi).toHaveBeenCalledWith("/api/v1/auth/me", "the-access-token");
  });

  /*
    The whole reason this is not a boolean. `hasProfile` answers `false` when it
    cannot tell, because the intake CTA is harmless either way. Here the same
    choice puts "You're not in a family yet." in front of a family of four every
    time the API blinks — which is the bug this seam was added to fix. Not
    knowing is a third answer and the screen has to be told it.
  */
  it("is unknown rather than false when the API cannot be reached", async () => {
    signedIn();
    mockCallApi.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3000"));

    expect(await hasFamily()).toBeNull();
  });

  it("is unknown rather than false when the API answers an error", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ error: { code: "UPSTREAM_UNAVAILABLE" } }, 502));

    expect(await hasFamily()).toBeNull();
  });

  it("is unknown rather than false when the session cannot be read", async () => {
    (createSupabaseServerClient as jest.Mock).mockRejectedValue(
      new Error("Invalid web environment"),
    );

    expect(await hasFamily()).toBeNull();
  });

  it("is unknown with no session, without calling the API", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue({
      auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null } })) },
    });

    expect(await hasFamily()).toBeNull();
    expect(mockCallApi).not.toHaveBeenCalled();
  });
});
