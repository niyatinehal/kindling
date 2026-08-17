import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../src/api/proxy";
import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";

/**
 * The browser's door to the plan API, mirroring `app/api/profile/route.ts`.
 *
 * POST carries no body: the plan is derived entirely from the stored profile, so
 * there is nothing for the client to send and nothing for it to get wrong.
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

  return proxyUpstream(() => callApi("/api/v1/plans/current", token));
}

export async function POST() {
  const token = await accessToken();
  if (token === undefined) {
    return unauthenticated();
  }

  return proxyUpstream(() => callApi("/api/v1/plans", token, { method: "POST" }));
}
