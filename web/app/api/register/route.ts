import { NextResponse } from "next/server";

import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (accessToken === undefined) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const upstream = await callApi("/api/v1/auth/register", accessToken, {
    method: "POST",
    body: await request.json(),
  });

  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
