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

  // Onboarding decides between /consent and /home from GET /api/me.
  return NextResponse.redirect(new URL("/home", url.origin));
}
