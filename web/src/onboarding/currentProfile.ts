import { proxyUpstream } from "../api/proxy";
import { readJsonBody } from "../api/readJsonBody";
import { callApi } from "../api/upstream";
import { createSupabaseServerClient } from "../supabase/server";
import type { ExistingProfile } from "../../app/onboarding/profile/Wizard";

/**
 * The caller's stored profile, for pre-filling the edit form.
 *
 * Distinct from `hasProfile`, which answers a yes/no for a card and deliberately
 * fetches nothing else. This one is only called by the screen that needs every
 * field, so the cheap check stays cheap.
 *
 * Never throws. A failure answers `null`, which renders an empty form — the same
 * thing a first-time user sees. That loses pre-filled convenience, never data:
 * PUT replaces the profile, so a blank form submitted by mistake would overwrite
 * it, which is why the form still requires every mandatory field to be answered.
 */
export async function currentProfile(): Promise<ExistingProfile | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken === undefined) {
      return null;
    }

    const response = await proxyUpstream(() => callApi("/api/v1/profiles/me", accessToken));
    if (!response.ok) {
      return null;
    }

    const body = await readJsonBody(response);
    if (typeof body !== "object" || body === null || !("profile" in body)) {
      return null;
    }
    return (body as { profile: ExistingProfile | null }).profile;
  } catch (reason) {
    console.error("profile could not be resolved for editing", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return null;
  }
}
