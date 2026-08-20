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
import { DELETE } from "../route";

const mockCallApi = callApi as jest.MockedFunction<typeof callApi>;
const signOut = jest.fn(() => Promise.resolve({ error: null }));

function signedIn() {
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: "the-token" } } }),
      signOut,
    },
  });
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  signOut.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("DELETE /api/account", () => {
  it("asks the API to erase the account", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await DELETE();

    expect(mockCallApi).toHaveBeenCalledWith("/api/v1/auth/me", "the-token", { method: "DELETE" });
    expect(response.status).toBe(204);
  });

  /*
    The session outlives the account otherwise. The cookie is still valid and
    still names a user id that no longer resolves, so the next request is a
    403 on a screen that believes it is signed in — the person who just asked
    to be erased is told their account needs registering.
  */
  it("ends the session once the account is gone", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(new Response(null, { status: 204 }));

    await DELETE();

    expect(signOut).toHaveBeenCalled();
  });

  // A refusal is not a deletion. Signing out here would log somebody out of an
  // account that still exists, without telling them why.
  it("keeps the session when the API refuses", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "FAMILY_NEEDS_ADMIN" } }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await DELETE();

    expect(response.status).toBe(409);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("refuses without a session, without calling the API", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue({
      auth: { getSession: () => Promise.resolve({ data: { session: null } }), signOut },
    });

    expect((await DELETE()).status).toBe(401);
    expect(mockCallApi).not.toHaveBeenCalled();
  });
});
