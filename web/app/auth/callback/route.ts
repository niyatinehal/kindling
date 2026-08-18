import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../src/supabase/server";

/**
 * Where a sign-in link lands.
 *
 * This was built for the Google flow to return to; that flow is gone, and the
 * magic link is now its only caller. `/api/auth/otp` names this route as its
 * `emailRedirectTo`, GoTrue appends the `code`, and this exchanges it for the
 * httpOnly session — which is why the link cannot simply point at the site
 * root, and why removing OAuth did not make this route removable.
 *
 * The exchange needs the PKCE verifier cookie set when the code was requested,
 * so a link opened in a different browser than the one that asked for it lands
 * here and legitimately fails. That is what the typed code on /signin is for.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code === null) {
    return NextResponse.redirect(new URL("/?error=signin", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("sign-in link exchange failed", { reason: error.message });
    return NextResponse.redirect(new URL("/?error=signin", url.origin));
  }

  // Always /home, and /home itself decides: it runs the onboarding guard
  // server-side and sends a user with no `users` row on to /consent. Deciding
  // here instead would leave /home reachable, unguarded, by typing the URL.
  return NextResponse.redirect(new URL("/home", url.origin));
}
