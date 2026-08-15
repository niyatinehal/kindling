/**
 * @jest-environment node
 */
jest.mock("../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { createSupabaseServerClient } from "../../../../src/supabase/server";
import { GET } from "../google/route";

const PROVIDER_URL =
  "https://project.supabase.co/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback";

function stubClient(result: { data: { url: string | null }; error: { message: string } | null }) {
  const signInWithOAuth = jest.fn(() => Promise.resolve(result));
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({ auth: { signInWithOAuth } });
  return signInWithOAuth;
}

function request() {
  return new Request("http://localhost:3000/api/auth/google");
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /api/auth/google", () => {
  it("redirects the browser to the provider URL Supabase returns", async () => {
    stubClient({ data: { url: PROVIDER_URL }, error: null });

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(PROVIDER_URL);
  });

  // The PKCE verifier is written by the server client's cookie adapter, so the
  // authorize URL has to be minted here rather than linked to directly — and
  // the provider must be told to come back to the callback route, which is the
  // only place that can exchange the code for an httpOnly session.
  it("asks the provider to return to the callback route on this origin", async () => {
    const signInWithOAuth = stubClient({ data: { url: PROVIDER_URL }, error: null });

    await GET(request());

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback" },
    });
  });

  it("sends the user back to the landing page when Supabase refuses", async () => {
    stubClient({ data: { url: null }, error: { message: "provider is not enabled" } });

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/?error=oauth");
  });

  it("sends the user back to the landing page when no URL comes back", async () => {
    stubClient({ data: { url: null }, error: null });

    const response = await GET(request());

    expect(response.headers.get("location")).toBe("http://localhost:3000/?error=oauth");
  });

  it("never returns Supabase's reason to the caller", async () => {
    stubClient({ data: { url: null }, error: { message: "provider is not enabled" } });

    const response = await GET(request());

    expect(await response.text()).not.toContain("not enabled");
    expect(response.headers.get("location")).not.toContain("not enabled");
  });
});
