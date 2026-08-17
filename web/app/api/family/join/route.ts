import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../../src/api/proxy";
import { callApi } from "../../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../../src/supabase/server";

/**
 * Redeems an invite code.
 *
 * The code travels in the BODY, not the path, even though the API puts it in the
 * path. A code in a client-side URL lands in browser history and in any proxy log
 * along the way, and it is the entire authorisation to join a family.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token === undefined) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  let code: string | undefined;
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.trim().toUpperCase() : undefined;
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  // Checked here rather than passed on: an empty code would build the path
  // `/invites//accept`, which is a different route entirely.
  if (code === undefined || !/^[0-9A-Z]{4,32}$/.test(code)) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  return proxyUpstream(() => callApi(`/api/v1/invites/${code}/accept`, token, { method: "POST" }));
}
