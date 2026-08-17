import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../src/api/proxy";
import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";

/**
 * Creates a family with the caller as its admin.
 *
 * There is no GET here: reading the family needs two upstream hops and belongs on
 * the server component (`src/family/currentFamily.ts`), not in a browser round
 * trip that would just re-do the same two calls.
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

  return proxyUpstream(() => callApi("/api/v1/families", token, { method: "POST", body }));
}
