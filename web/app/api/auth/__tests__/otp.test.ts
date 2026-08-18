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
