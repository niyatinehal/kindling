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
jest.mock("../../../src/onboarding/isGuestSession", () => ({
  isGuestSession: jest.fn(() => Promise.resolve(false)),
}));
// Stubbed as an intention rather than left to fall out of the `callApi` mock:
// the page resolves guest status and profile status concurrently, and a single
// mocked `Response` cannot have its body read twice.
jest.mock("../../../src/onboarding/hasProfile", () => ({
  hasProfile: jest.fn(() => Promise.resolve(false)),
}));
// Stubbed for the same reason: it reads /auth/me too, and the single mocked
// `Response` these tests hand back cannot have its body consumed twice.
jest.mock("../../../src/family/hasFamily", () => ({
  hasFamily: jest.fn(() => Promise.resolve(null)),
}));

import { redirect } from "next/navigation";

import { callApi } from "../../../src/api/upstream";
import { hasFamily } from "../../../src/family/hasFamily";
import { hasProfile } from "../../../src/onboarding/hasProfile";
import { isGuestSession } from "../../../src/onboarding/isGuestSession";
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
  // `clearMocks` (jest.config.js) clears calls/instances/results but NOT an
  // implementation set via `mockResolvedValue` — only `resetMocks` does that.
  // Without this, the `true` set by the "marks the view as a guest" test
  // below would persist into every test that runs after it in file order.
  (isGuestSession as jest.Mock).mockResolvedValue(false);
  (hasProfile as jest.Mock).mockResolvedValue(false);
  (hasFamily as jest.Mock).mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("/home", () => {
  // The regression this guard exists for. Someone following a sign-in link for
  // the first time arrives with a Supabase session and no `users` row, no
  // ConsentRecord and no display name, and /auth/callback drops them here. If
  // /home renders for them, the health-data consent is never collected at all
  // and every authenticated call afterwards is a 403 nothing is listening for.
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

  it("marks the view as a guest when the session is anonymous", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ id: "u1", display_name: "Guest", family: null }, 200));
    (isGuestSession as jest.Mock).mockResolvedValue(true);

    const page = await HomePage();

    expect(page.props.isGuest).toBe(true);
  });

  it("tells the view whether intake is done", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ id: "u1", display_name: "Meera", family: null }, 200));
    (hasProfile as jest.Mock).mockResolvedValue(true);

    const page = await HomePage();

    expect(page.props.hasProfile).toBe(true);
  });

  // The card on this screen used to state "You're not in a family yet." without
  // anything ever having asked. The page has to resolve it and hand it down.
  it("tells the view whether there is a family", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ id: "u1", display_name: "Meera", family: null }, 200));
    (hasFamily as jest.Mock).mockResolvedValue(true);

    const page = await HomePage();

    expect(page.props.inFamily).toBe(true);
  });

  // An unreachable API is not evidence that somebody has no family, so the
  // unknown has to survive the trip to the view rather than flattening to false.
  it("passes on not knowing, rather than guessing", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ id: "u1", display_name: "Meera", family: null }, 200));
    (hasFamily as jest.Mock).mockResolvedValue(null);

    const page = await HomePage();

    expect(page.props.inFamily).toBeNull();
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
