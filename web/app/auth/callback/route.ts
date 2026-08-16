import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../src/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code === null) {
    return NextResponse.redirect(new URL("/?error=oauth", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("oauth exchange failed", { reason: error.message });
    return NextResponse.redirect(new URL("/?error=oauth", url.origin));
  }

  // Always /home, and /home itself decides: it runs the onboarding guard
  // server-side and sends a user with no `users` row on to /consent. Deciding
  // here instead would leave /home reachable, unguarded, by typing the URL.
  return NextResponse.redirect(new URL("/home", url.origin));
}
