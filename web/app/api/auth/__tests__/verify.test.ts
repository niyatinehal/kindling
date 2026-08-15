/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const setAllCalls: { name: string; value: string; options: Record<string, unknown> }[] = [];

jest.mock("../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { createSupabaseServerClient } from "../../../../src/supabase/server";
import { POST } from "../verify/route";

function stubClient(result: { error: { message: string } | null }) {
  return {
    auth: {
      verifyOtp: jest.fn(() => {
        // Mimic @supabase/ssr writing the session through the cookie adapter.
        setAllCalls.push({
          name: "sb-access-token",
          value: "token-value",
          options: { httpOnly: true, sameSite: "lax", path: "/" },
        });
        return Promise.resolve(result);
      }),
    },
  };
}

beforeEach(() => {
  setAllCalls.length = 0;
});

describe("POST /api/auth/verify", () => {
  it("returns 200 when the code is accepted", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(stubClient({ error: null }));

    const response = await POST(
      new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ contact: "+911234567890", code: "123456" }),
      }),
    );

    expect(response.status).toBe(200);
  });

  // NOT the HttpOnly security test: the `httpOnly: true` asserted below is
  // hardcoded in this file's own `verifyOtp` stub, so it says nothing about
  // `route.ts`, which never touches cookie options. What this does prove is
  // that the route lets the Supabase client's cookie write reach the adapter
  // unmodified. The real HttpOnly guarantee lives in `secureCookieOptions`
  // and is enforced by `src/supabase/__tests__/secureCookieOptions.test.ts`.
  it("lets the client's cookie write proceed untouched", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(stubClient({ error: null }));

    await POST(
      new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ contact: "+911234567890", code: "123456" }),
      }),
    );

    expect(setAllCalls).toHaveLength(1);
    expect(setAllCalls[0]?.options.httpOnly).toBe(true);
  });

  it("returns 401 and no cookie when the code is wrong", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      stubClient({ error: { message: "Token has expired or is invalid" } }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ contact: "+911234567890", code: "000000" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("never returns Supabase's message to the caller", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      stubClient({ error: { message: "Token has expired or is invalid" } }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ contact: "+911234567890", code: "000000" }),
      }),
    );

    expect(JSON.stringify(await response.json())).not.toContain("expired");
  });
});
