import { NextResponse } from "next/server";

import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (accessToken === undefined) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const upstream = await callApi("/api/v1/auth/me", accessToken);
  // Status is passed through unchanged — a 403 REGISTRATION_REQUIRED is a step
  // in onboarding, not a failure, and flattening it would hide the seam.
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
