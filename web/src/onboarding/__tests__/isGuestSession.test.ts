/**
 * @jest-environment node
 */
jest.mock("../../supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

import { createSupabaseServerClient } from "../../supabase/server";
import { isGuestSession } from "../isGuestSession";

function withUser(user: unknown) {
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user }, error: null })) },
  });
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("isGuestSession", () => {
  it("is true for an anonymous user", async () => {
    withUser({ id: "u1", is_anonymous: true });
    expect(await isGuestSession()).toBe(true);
  });

  it("is false for a normal user", async () => {
    withUser({ id: "u1", is_anonymous: false });
    expect(await isGuestSession()).toBe(false);
  });

  // Supabase omits the claim entirely for accounts created before anonymous
  // sign-in existed. Absent must mean "not a guest", never undefined.
  it("is false when the claim is absent", async () => {
    withUser({ id: "u1" });
    expect(await isGuestSession()).toBe(false);
  });

  it("is false when there is no session", async () => {
    withUser(null);
    expect(await isGuestSession()).toBe(false);
  });

  // This decides a chip and a pre-filled field. It must never be the reason
  // a page fails to render.
  it("is false when the session cannot be read", async () => {
    (createSupabaseServerClient as jest.Mock).mockRejectedValue(
      new Error("Invalid web environment"),
    );
    expect(await isGuestSession()).toBe(false);
  });
});
