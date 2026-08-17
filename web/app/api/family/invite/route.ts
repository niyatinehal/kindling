import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../../src/api/proxy";
import { readJsonBody } from "../../../../src/api/readJsonBody";
import { callApi } from "../../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../../src/supabase/server";

/**
 * Issues an invite for the caller's own family.
 *
 * The family id is resolved server-side from `/auth/me` rather than accepted from
 * the client. The API would reject a mismatched id anyway, but not accepting one
 * at all means a client cannot even express "invite someone to that family".
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

  const meResponse = await proxyUpstream(() => callApi("/api/v1/auth/me", token));
  if (!meResponse.ok) {
    return meResponse;
  }

  const me = await readJsonBody(meResponse);
  const familyId =
    typeof me === "object" && me !== null && "family" in me
      ? (me as { family: { id?: string } | null }).family?.id
      : undefined;

  if (familyId === undefined) {
    return NextResponse.json({ error: { code: "NOT_IN_FAMILY" } }, { status: 403 });
  }

  return proxyUpstream(() =>
    callApi(`/api/v1/families/${familyId}/invites`, token, { method: "POST", body }),
  );
}
