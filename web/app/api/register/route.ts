import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../src/api/proxy";
import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (accessToken === undefined) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // The caller's own body, not upstream's — same rule though: answer with an
    // envelope rather than letting the rejection become a bodiless 500.
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  // Every remaining outcome, success or failure, goes through `proxyUpstream`:
  // this handler must not be able to answer with a bodiless 500, because the
  // client parses the body before it decides where to route.
  return proxyUpstream(() =>
    callApi("/api/v1/auth/register", accessToken, { method: "POST", body }),
  );
}
