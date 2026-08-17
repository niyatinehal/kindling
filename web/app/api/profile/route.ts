import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../src/api/proxy";
import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";

/**
 * The browser's door to the profile API. Mirrors `app/api/me/route.ts`: the
 * access token never reaches the client, so the client cannot call Express
 * itself — it calls this, and this attaches the Bearer header.
 *
 * Bodies are passed through unvalidated on purpose. Express owns the schema
 * (`api/src/routes/profiles.ts`), and a second copy of those rules here would
 * be a second thing to keep in step — and the one that drifts, since it is the
 * copy no integration test exercises.
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

  return proxyUpstream(() => callApi("/api/v1/profiles/me", token));
}

export async function PUT(request: Request) {
  const token = await accessToken();
  if (token === undefined) {
    return unauthenticated();
  }

  // An unreadable body is a 400 here rather than a crash: `request.json()`
  // throws on empty or malformed input, and this handler's contract — like
  // every other one in this app — is to always answer with a parsable envelope.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  return proxyUpstream(() => callApi("/api/v1/profiles/me", token, { method: "PUT", body }));
}
