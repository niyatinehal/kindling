/**
 * @jest-environment node
 */
jest.mock("../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { createSupabaseServerClient } from "../../../../src/supabase/server";
import { POST } from "../otp/route";

function stubClient(result: { error: { message: string } | null } = { error: null }) {
  const signInWithOtp = jest.fn(() => Promise.resolve(result));
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({ auth: { signInWithOtp } });
  return signInWithOtp;
}

function request(contact: string, origin = "http://localhost:3001") {
  return new Request(`${origin}/api/auth/otp`, {
    method: "POST",
    body: JSON.stringify({ contact }),
  });
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/auth/otp", () => {
  // Without this, Supabase falls back to the project's Site URL, which points
  // at the site root — and the root cannot exchange the `code` the link comes
  // back with. Only /auth/callback can. Naming the destination here also stops
  // the link depending on a dashboard setting nothing in this repo can pin.
  it("asks Supabase to send the email link back to the callback route on this origin", async () => {
    const signInWithOtp = stubClient();

    await POST(request("someone@example.com"));

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "someone@example.com",
      options: { emailRedirectTo: "http://localhost:3001/auth/callback" },
    });
  });

  // An SMS carries a code and no link, so there is nothing for a destination to
  // apply to. Sending one anyway would have GoTrue validate a redirect nobody
  // will follow, and a stack whose allow-list has drifted would then reject a
  // sign-in that never needed the URL in the first place.
  it("names no destination for a phone number, which gets a code and no link", async () => {
    const signInWithOtp = stubClient();

    await POST(request("+919876543210"));

    expect(signInWithOtp).toHaveBeenCalledWith({ phone: "+919876543210" });
  });
});

describe("rate limiting", () => {
  /*
    Each test needs its own limiter. The routes hold theirs at module scope —
    which is the point, since the counter must outlive a request — so a fresh
    module registry is how a test gets a clean one.
  */
  async function freshRoute() {
    let route!: typeof import("../otp/route");
    let server!: typeof import("../../../../src/supabase/server");
    await jest.isolateModulesAsync(async () => {
      server = await import("../../../../src/supabase/server");
      route = await import("../otp/route");
    });
    return { send: route.POST, client: server.createSupabaseServerClient as jest.Mock };
  }

  // An OTP costs a message from a daily quota, and on SMS it costs money. A
  // script hitting this endpoint unthrottled empties both, and the people it
  // locks out are the real users whose codes stop arriving.
  it("stops sending to the same contact after a burst", async () => {
    const { send, client } = await freshRoute();
    const signInWithOtp = jest.fn(() => Promise.resolve({ error: null }));
    client.mockResolvedValue({ auth: { signInWithOtp } });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await send(request("burst@example.com"));
    }
    const refused = await send(request("burst@example.com"));

    expect(refused.status).toBe(429);
    expect(signInWithOtp).toHaveBeenCalledTimes(3);
  });

  // Without it a client that does not know when to come back simply retries at
  // once, which is the traffic being refused in the first place.
  it("says when to come back", async () => {
    const { send, client } = await freshRoute();
    client.mockResolvedValue({
      auth: { signInWithOtp: jest.fn(() => Promise.resolve({ error: null })) },
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await send(request("retry@example.com"));
    }
    const refused = await send(request("retry@example.com"));

    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await refused.json()).toEqual({ error: { code: "RATE_LIMITED" } });
  });

  // One person burning their own allowance must not stop anybody else signing
  // in — which is what a limiter keyed only by address would do.
  it("does not let one contact lock out another", async () => {
    const { send, client } = await freshRoute();
    client.mockResolvedValue({
      auth: { signInWithOtp: jest.fn(() => Promise.resolve({ error: null })) },
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await send(request("noisy@example.com"));
    }

    expect((await send(request("quiet@example.com"))).status).toBe(200);
  });
});
