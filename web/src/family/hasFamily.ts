import { proxyUpstream } from "../api/proxy";
import { readJsonBody } from "../api/readJsonBody";
import { callApi } from "../api/upstream";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * Whether the caller belongs to a family — `null` when we could not find out.
 *
 * A separate seam from `currentFamily`, and a deliberately smaller one. That
 * function makes two upstream hops because the family screen needs the member
 * list; /home needs only the yes/no, and the first hop already holds it. Paying
 * for the second on every home render to discard the answer would be the cost
 * the family card's comment was right to avoid.
 *
 * Three answers rather than two, which is the point of this seam existing at
 * all. `hasProfile` collapses "no" and "cannot tell" into `false` because the
 * intake CTA is harmless either way. Here that collapse is a lie with a
 * specific victim: /home used to state "You're not in a family yet." as a
 * hardcoded fact, and answering `false` on a failed request would keep telling
 * an existing family exactly that whenever the API blinked. So not knowing is
 * its own answer, and the card has to render it as one.
 *
 * Never throws. This decides a card, never a redirect, so it must not be the
 * reason a page fails to render.
 */
export async function hasFamily(): Promise<boolean | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken === undefined) {
      // Not "no family" — no idea. The guard sends a caller with no session to
      // /signin long before this renders, so reaching here at all is unusual
      // enough that guessing would be the wrong instinct.
      return null;
    }

    const response = await proxyUpstream(() => callApi("/api/v1/auth/me", accessToken));
    if (!response.ok) {
      return null;
    }

    const body = await readJsonBody(response);
    if (typeof body !== "object" || body === null || !("family" in body)) {
      return null;
    }

    return (body as { family: unknown }).family !== null;
  } catch (reason) {
    console.error("family membership could not be resolved", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return null;
  }
}
