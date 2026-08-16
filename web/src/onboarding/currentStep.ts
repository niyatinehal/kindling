import { proxyUpstream } from "../api/proxy";
import { readJsonBody } from "../api/readJsonBody";
import { callApi } from "../api/upstream";
import { createSupabaseServerClient } from "../supabase/server";
import { nextStep, type OnboardingDestination } from "./nextStep";

/**
 * Where the current request belongs, decided server-side before a page renders.
 *
 * This is the server twin of the sign-in screen's `nextStep(me.status, body)`
 * call, and it deliberately reuses `nextStep` rather than restating the rules:
 * the "403 + REGISTRATION_REQUIRED means consent, any other 403 does not"
 * distinction must exist once, or the OAuth journey and the OTP journey drift
 * apart exactly where a first-time Google user gets stranded.
 *
 * It calls `callApi` directly instead of fetching our own `/api/me` over HTTP.
 * A server component has no origin to build an absolute URL from — inside the
 * container `request.url` is the bind address, not the address a client would
 * use — so an HTTP call to ourselves would be a second, breakable copy of
 * something we can do in-process. `/api/me` exists for the browser; the server
 * goes straight to the same two steps it performs.
 *
 * Task 5's contract holds here too: this never throws and never hangs. Every
 * failure resolves to a destination, so a page can route on the answer without
 * a try/catch of its own — which matters because `redirect()` works BY
 * throwing, and a guard that swallowed throws would swallow the redirect.
 */
export async function currentStep(): Promise<OnboardingDestination> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken === undefined) {
      // The same answer `/api/me` gives a caller with no session, reached
      // without a pointless round trip to an API that would only reject it.
      return nextStep(401, { error: { code: "UNAUTHENTICATED" } });
    }

    // Through `proxyUpstream` for its guarantees, not to produce a response:
    // it turns a dead API, an HTML error page or an unreadable body into a 502
    // envelope, so what `nextStep` sees is always a status with a body that
    // matches it. Reading the upstream `Response` directly here would be a
    // weaker second copy of that normalisation.
    const response = await proxyUpstream(() => callApi("/api/v1/auth/me", accessToken));
    return nextStep(response.status, await readJsonBody(response));
  } catch (reason) {
    // Reaching the session at all can fail — a missing env var, a cookie store
    // that throws. The user lands on /error rather than on a crashed render.
    console.error("onboarding step could not be resolved", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return "/error";
  }
}
