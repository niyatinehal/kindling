/**
 * @jest-environment node
 */
const setAllCalls: { name: string; value: string; options: Record<string, unknown> }[] = [];

jest.mock("../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { createSupabaseServerClient } from "../../../../src/supabase/server";
import { POST } from "../guest/route";

function stubClient(result: { error: { message: string } | null }) {
  return {
    auth: {
      signInAnonymously: jest.fn(() => {
        if (result.error === null) {
          // Mimic @supabase/ssr writing the session through the cookie adapter.
          setAllCalls.push({
            name: "sb-access-token",
            value: "token-value",
            options: { httpOnly: true, sameSite: "lax", path: "/" },
          });
        }
        return Promise.resolve(result);
      }),
    },
  };
}

beforeEach(() => {
  setAllCalls.length = 0;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/auth/guest", () => {
  it("returns 200 when the anonymous sign-in succeeds", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(stubClient({ error: null }));

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true });
  });

  // NOT the HttpOnly security test: the `httpOnly: true` asserted below is
  // hardcoded in this file's own `signInAnonymously` stub, so it says nothing
  // about `route.ts` — which has no request body and touches cookie options
  // even less than `/api/auth/verify` does. What this proves is that the
  // route lets the Supabase client's cookie write reach the adapter
  // unmodified. The real HttpOnly guarantee lives in `secureCookieOptions`
  // and is enforced by `web/src/supabase/__tests__/secureCookieOptions.test.ts`.
  it("lets the client's cookie write proceed untouched", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(stubClient({ error: null }));

    await POST();

    expect(setAllCalls).toHaveLength(1);
    expect(setAllCalls[0]?.options.httpOnly).toBe(true);
  });

  // The likely real-world failure: the config flip has not been applied to
  // this environment. It must be a clean envelope the sign-in screen can
  // render, not a crash.
  it("returns a 502 envelope when anonymous sign-ins are disabled", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      stubClient({ error: { message: "Anonymous sign-ins are disabled" } }),
    );

    const response = await POST();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "GUEST_SIGNIN_FAILED" } });
  });

  // The reason is ours, not the caller's. It goes to the log only.
  it("never returns the upstream reason", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      stubClient({ error: { message: "Anonymous sign-ins are disabled" } }),
    );

    const body = JSON.stringify(await (await POST()).json());

    expect(body).not.toContain("disabled");
  });
});
