/**
 * @jest-environment node
 */
jest.mock("next/navigation", () => ({
  // Next signals a redirect by THROWING, and the real thing is no different.
  // Modelling that here is the point: a guard that wrapped its work in a
  // try/catch would swallow the throw and render the page it was leaving.
  redirect: jest.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));
jest.mock("../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("../../../src/api/upstream", () => ({
  callApi: jest.fn(),
}));

import { redirect } from "next/navigation";

import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";
import { HomeView } from "../HomeView";
import HomePage from "../page";

const mockCallApi = callApi as jest.MockedFunction<typeof callApi>;
const mockRedirect = redirect as unknown as jest.Mock;

function signedIn() {
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({
    auth: {
      getSession: jest.fn(() =>
        Promise.resolve({ data: { session: { access_token: "the-access-token" } } }),
      ),
    },
  });
}

function signedOut() {
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({
    auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null } })) },
  });
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Renders the page and reports where it sent the user instead. */
async function redirectedTo(): Promise<string> {
  await expect(HomePage()).rejects.toThrow(/^NEXT_REDIRECT:/);
  return mockRedirect.mock.calls[0]?.[0] as string;
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("/home", () => {
  // The regression this guard exists for. A first-time Google user finishes
  // OAuth with a Supabase session and no `users` row, no ConsentRecord and no
  // display name, and /auth/callback drops them here. If /home renders for
  // them, the health-data consent is never collected at all and every
  // authenticated call afterwards is a 403 nothing is listening for.
  it("sends a signed-in user who has not registered to consent", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ error: { code: "REGISTRATION_REQUIRED" } }, 403));

    expect(await redirectedTo()).toBe("/consent");
  });

  it("renders for a registered user", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ id: "u1", display_name: "Meera", family: null }, 200));

    const page = await HomePage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(page.type).toBe(HomeView);
  });

  it("sends a caller with no session to sign in, without calling the API", async () => {
    signedOut();

    expect(await redirectedTo()).toBe("/signin");
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("sends a session the API rejects to sign in", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ error: { code: "UNAUTHENTICATED" } }, 401));

    expect(await redirectedTo()).toBe("/signin");
  });

  // A 403 is only the registration seam when the CODE says so. Routing a
  // FORBIDDEN_ROLE here to /consent would post a second registration.
  it("does not treat an unrelated 403 as the registration seam", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ error: { code: "FORBIDDEN_ROLE" } }, 403));

    expect(await redirectedTo()).toBe("/error");
  });

  // Never throw, never hang: a dead API must land the user somewhere coherent
  // rather than crashing the render.
  it("sends the user to the error page when the API cannot be reached", async () => {
    signedIn();
    mockCallApi.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3000"));

    expect(await redirectedTo()).toBe("/error");
  });

  it("sends the user to the error page when the session itself cannot be read", async () => {
    (createSupabaseServerClient as jest.Mock).mockRejectedValue(
      new Error("Invalid web environment"),
    );

    expect(await redirectedTo()).toBe("/error");
  });
});
