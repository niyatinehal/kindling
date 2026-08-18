/**
 * @jest-environment node
 */
jest.mock("../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { createSupabaseServerClient } from "../../../../src/supabase/server";
import { POST } from "../logout/route";

function stubClient(result: { error: { message: string } | null } = { error: null }) {
  const signOut = jest.fn(() => Promise.resolve(result));
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({ auth: { signOut } });
  return signOut;
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/auth/logout", () => {
  // Clearing the cookie is not something this route can do by hand: it is
  // httpOnly and written by the client's cookie adapter, so revoking the
  // session through the client is what removes it.
  it("ends the Supabase session", async () => {
    const signOut = stubClient();

    const response = await POST();

    expect(signOut).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("reports a failure rather than claiming the user is signed out", async () => {
    stubClient({ error: { message: "session not found" } });

    const response = await POST();

    expect(response.status).toBe(502);
  });

  // Same rule as every other auth route here: the reason is logged, never
  // handed back.
  it("never returns Supabase's reason to the caller", async () => {
    stubClient({ error: { message: "session not found" } });

    const response = await POST();

    expect(await response.text()).not.toContain("session not found");
  });
});
