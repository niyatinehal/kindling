import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../src/supabase/server";

/**
 * Starts the Google flow. The sign-in screen links here, never to
 * `/auth/callback` — that is where Google comes BACK to, and arriving there
 * with no `code` is bounced to `/?error=oauth`.
 *
 * This has to run server-side for the same reason everything else does: the
 * PKCE verifier is written by the server client's cookie adapter, so it lands
 * in an httpOnly cookie that `/auth/callback` can read when it exchanges the
 * code. `signInWithOAuth` does not redirect outside a browser — it just hands
 * back the authorize URL — so the redirect is ours to issue.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", origin).toString() },
  });

  if (error !== null || !data.url) {
    // Same shape of failure as the callback's, so it lands in the same place.
    // The reason is logged and never handed to the caller — a browser is
    // following this link, and "provider is not enabled" is our problem.
    console.error("oauth start failed", { reason: error?.message ?? "no provider url returned" });
    return NextResponse.redirect(new URL("/?error=oauth", origin));
  }

  return NextResponse.redirect(data.url);
}
