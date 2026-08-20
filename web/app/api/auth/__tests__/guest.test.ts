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

/** Next always hands a route handler a Request; the route now reads the caller off it. */
function guestRequest() {
  return new Request("http://localhost:3001/api/auth/guest", { method: "POST" });
}

describe("POST /api/auth/guest", () => {
  it("returns 200 when the anonymous sign-in succeeds", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(stubClient({ error: null }));

    const response = await POST(guestRequest());

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

    await POST(guestRequest());

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

    const response = await POST(guestRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "GUEST_SIGNIN_FAILED" } });
  });

  // The reason is ours, not the caller's. It goes to the log only.
  it("never returns the upstream reason", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      stubClient({ error: { message: "Anonymous sign-ins are disabled" } }),
    );

    const body = JSON.stringify(await (await POST(guestRequest())).json());

    expect(body).not.toContain("disabled");
  });
});

describe("rate limiting", () => {
  async function freshRoute() {
    let route!: typeof import("../guest/route");
    let server!: typeof import("../../../../src/supabase/server");
    await jest.isolateModulesAsync(async () => {
      server = await import("../../../../src/supabase/server");
      route = await import("../guest/route");
    });
    return { send: route.POST, client: server.createSupabaseServerClient as jest.Mock };
  }

  // Every guest sign-in creates a real row in auth.users. Unthrottled, this
  // endpoint is a one-line script for filling the project's user table.
  it("stops creating guests after a burst from one caller", async () => {
    const { send, client } = await freshRoute();
    const signInAnonymously = jest.fn(() => Promise.resolve({ error: null }));
    client.mockResolvedValue({ auth: { signInAnonymously } });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await send(new Request("http://localhost:3001/api/auth/guest", { method: "POST" }));
    }
    const refused = await send(
      new Request("http://localhost:3001/api/auth/guest", { method: "POST" }),
    );

    expect(refused.status).toBe(429);
    expect(signInAnonymously).toHaveBeenCalledTimes(10);
  });
});
