import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../src/supabase/server";

/**
 * Ends the session.
 *
 * There is nothing to delete by hand here. The session lives in an httpOnly
 * cookie written by the server client's cookie adapter, so revoking it through
 * that same client is what clears it — and it clears it with the flags
 * `secureCookieOptions` forces, rather than a hand-rolled expiry that could
 * miss one.
 *
 * POST, not GET: signing out changes state, and a GET would let a prefetch, a
 * crawler or an <img> tag anywhere on the origin sign the user out.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    // Logged, never returned — the same rule the rest of /api/auth follows.
    console.error("sign-out failed", { reason: error.message });
    return NextResponse.json({ error: { code: "SIGN_OUT_FAILED" } }, { status: 502 });
  }

  return NextResponse.json({ signedOut: true });
}
