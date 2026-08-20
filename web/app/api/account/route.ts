import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../src/api/proxy";
import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";

/**
 * Erasure, from the browser's side.
 *
 * DELETE rather than POST to some `/delete` path: this is the one operation in
 * the app that removes a resource entirely, and the method that says so is the
 * one that cannot be reached by a prefetch, a crawler or a stray link.
 *
 * The sign-out afterwards is not tidiness. The cookie outlives the rows, and a
 * still-valid session naming a user id that no longer resolves sends the next
 * request into the API's REGISTRATION_REQUIRED seam — so the person who just
 * asked to be erased would be shown the consent screen, being invited to
 * register the account they deleted.
 *
 * It only happens on a real deletion. A 409 means the account is still there,
 * and signing somebody out of an account that still exists tells them nothing
 * about why.
 */
export async function DELETE(): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token === undefined) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const response = await proxyUpstream(() =>
    callApi("/api/v1/auth/me", token, { method: "DELETE" }),
  );

  if (response.status === 204) {
    const { error } = await supabase.auth.signOut();
    if (error !== null) {
      // The account is already gone, so this is not a failure to report to the
      // caller — there is nothing left to protect. It is worth a log line
      // because a cookie that outlives its user is confusing to debug later.
      console.error("sign-out after deletion failed", { reason: error.message });
    }
  }

  return response;
}
