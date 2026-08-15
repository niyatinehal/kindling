import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../src/api/proxy";
import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (accessToken === undefined) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  // Every remaining outcome, success or failure, goes through `proxyUpstream`:
  // this handler must not be able to answer with a bodiless 500, because the
  // client parses the body before it decides where to route.
  return proxyUpstream(() => callApi("/api/v1/auth/me", accessToken));
}
