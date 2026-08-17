import { proxyUpstream } from "../api/proxy";
import { readJsonBody } from "../api/readJsonBody";
import { callApi } from "../api/upstream";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * Whether the caller has completed wellness intake.
 *
 * A separate seam rather than a second call inlined into `/home`'s guard, for
 * the same reason `isGuestSession` is one: the guard's job is deciding WHERE a
 * request belongs, and this only decides what the Today card says. Keeping them
 * apart means a page can be tested by stubbing an intention instead of a
 * transport.
 *
 * There is no "partial profile" to report. The API refuses to store an
 * incomplete one, so presence is the whole answer.
 *
 * Never throws. Every failure answers `false` — the profile CTA is the safe
 * thing to show when we cannot tell, because it leads somewhere useful and
 * claims nothing that isn't true.
 */
export async function hasProfile(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken === undefined) {
      return false;
    }

    const response = await proxyUpstream(() => callApi("/api/v1/profiles/me", accessToken));
    if (!response.ok) {
      return false;
    }

    const body = await readJsonBody(response);
    return (
      typeof body === "object" &&
      body !== null &&
      "profile" in body &&
      (body as { profile: unknown }).profile !== null
    );
  } catch (reason) {
    console.error("profile status could not be resolved", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return false;
  }
}
