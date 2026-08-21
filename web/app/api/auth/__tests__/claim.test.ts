/**
 * @jest-environment node
 */
/*
  `after()` refuses to run outside a request scope, and these tests call the
  handler directly rather than through a server. Invoking the callback
  immediately is the honest stand-in: what the real thing guarantees is that
  the work runs, only later than the response.
*/
jest.mock("next/server", () => {
  const actual = jest.requireActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (work: () => unknown) => void work() };
});

jest.mock("../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { createSupabaseServerClient } from "../../../../src/supabase/server";
import { POST } from "../claim/route";

function stubClient(
  result: { error: { message: string; code?: string } | null } = { error: null },
) {
  const updateUser = jest.fn(() => Promise.resolve(result));
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({ auth: { updateUser } });
  return updateUser;
}

function request(contact: string) {
  return new Request("http://localhost:3001/api/auth/claim", {
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

describe("POST /api/auth/claim", () => {
  /*
    Claiming attaches an identity to the SAME anonymous auth user rather than
    creating a new one. That is the whole point: `users.auth_user_id` is what
    ties a week of logged data to a person, so a new auth user would strand
    every row that already exists.
  */
  it("attaches an email to the session already signed in", async () => {
    const updateUser = stubClient();

    const response = await POST(request("someone@example.com"));

    expect(updateUser).toHaveBeenCalledWith({ email: "someone@example.com" });
    expect(response.status).toBe(200);
  });

  it("attaches a phone number the same way", async () => {
    const updateUser = stubClient();

    await POST(request("+919876543210"));

    expect(updateUser).toHaveBeenCalledWith({ phone: "+919876543210" });
  });

  // Somebody typing an address they already have an account for is the common
  // mistake here, and "we couldn't add that" would leave them retrying it.
  it("says so when the address already belongs to somebody", async () => {
    stubClient({ error: { message: "already registered", code: "email_exists" } });

    const response = await POST(request("taken@example.com"));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "CLAIM_TAKEN" } });
  });

  it("never returns the upstream reason", async () => {
    stubClient({ error: { message: "postgres said something specific" } });

    const response = await POST(request("someone@example.com"));

    expect(JSON.stringify(await response.json())).not.toContain("postgres");
  });
});
