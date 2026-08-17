import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../src/api/proxy";
import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";

/**
 * The browser's door to tracking.
 *
 * GET is here as well as in `src/tracking/summary.ts` on purpose: the server
 * component uses the latter to render populated on first paint, and the client
 * uses this one to refresh the tiles after a log without a full navigation.
 */
async function accessToken(): Promise<string | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

const unauthenticated = (): NextResponse =>
  NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });

export async function GET() {
  const token = await accessToken();
  if (token === undefined) {
    return unauthenticated();
  }

  return proxyUpstream(() => callApi("/api/v1/tracking/summary", token));
}

export async function POST(request: Request) {
  const token = await accessToken();
  if (token === undefined) {
    return unauthenticated();
  }

  // Bodies are passed straight through: Express owns the per-type schema, and a
  // second copy of those rules here would be the copy that drifts.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  return proxyUpstream(() => callApi("/api/v1/tracking/logs", token, { method: "POST", body }));
}
