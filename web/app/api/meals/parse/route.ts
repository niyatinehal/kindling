import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../../src/api/proxy";
import { callApi } from "../../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../../src/supabase/server";

/**
 * Reads typed pantry text into ingredient keys. The answer is only a list for
 * the user to confirm — suggestions still come from `/api/meals`, with the
 * confirmed keys, so nothing typed here reaches the suggestion engine unchecked.
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

  return proxyUpstream(() =>
    callApi("/api/v1/meals/parse-pantry", token, { method: "POST", body }),
  );
}
