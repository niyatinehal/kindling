import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../../src/api/proxy";
import { callApi } from "../../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../../src/supabase/server";

/**
 * The AI pantry consent toggle. Express decides whether it may be turned on —
 * a child account cannot — so this only attaches the token and passes through.
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

  return proxyUpstream(() => callApi("/api/v1/meals/pantry-consent", token));
}

export async function PUT(request: Request) {
  const token = await accessToken();
  if (token === undefined) {
    return unauthenticated();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  return proxyUpstream(() =>
    callApi("/api/v1/meals/pantry-consent", token, { method: "PUT", body }),
  );
}
