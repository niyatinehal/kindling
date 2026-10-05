import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../../src/api/proxy";
import { callApi } from "../../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../../src/supabase/server";

/**
 * "Why this dish" sentences for suggestions already on screen. Express checks
 * consent and every sentence; this only attaches the token.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token === undefined) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  return proxyUpstream(() => callApi("/api/v1/meals/explain", token, { method: "POST", body }));
}
