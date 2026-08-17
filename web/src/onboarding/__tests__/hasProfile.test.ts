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
import { hasProfile } from "../hasProfile";

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

describe("hasProfile", () => {
  it("is true when the API returns a profile", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ profile: { birth_year: 1963 } }, 200));

    expect(await hasProfile()).toBe(true);
  });

  it("is false when the API returns a null profile", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ profile: null }, 200));

    expect(await hasProfile()).toBe(false);
  });

  it("is false with no session, without calling the API", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue({
      auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null } })) },
    });

    expect(await hasProfile()).toBe(false);
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  // This decides a card, never a redirect, so it must never be the reason a page
  // fails to render. Showing the intake CTA is the safe answer when we cannot
  // tell: it leads somewhere useful and claims nothing untrue.
  it("is false rather than throwing when the API is unreachable", async () => {
    signedIn();
    mockCallApi.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3000"));

    expect(await hasProfile()).toBe(false);
  });

  it("is false rather than throwing when the session cannot be read", async () => {
    (createSupabaseServerClient as jest.Mock).mockRejectedValue(
      new Error("Invalid web environment"),
    );

    expect(await hasProfile()).toBe(false);
  });

  it("is false when the API answers 403 before registration", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ error: { code: "REGISTRATION_REQUIRED" } }, 403));

    expect(await hasProfile()).toBe(false);
  });
});
