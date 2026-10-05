import { proxyUpstream } from "../api/proxy";
import { readJsonBody } from "../api/readJsonBody";
import { callApi } from "../api/upstream";
import { createSupabaseServerClient } from "../supabase/server";
import type { PantryConsent } from "./mealTypes";

const OFF: PantryConsent = { enabled: false, available: false, photo: false };

/**
 * Whether the AI pantry toggle should be shown, and where it stands.
 *
 * Never throws. Every failure answers "off and not offered": when we cannot
 * tell whether someone consented, the safe reading is that they did not, and
 * the screen still works on the synonym table.
 */
export async function currentPantryConsent(): Promise<PantryConsent> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken === undefined) {
      return OFF;
    }

    const response = await proxyUpstream(() =>
      callApi("/api/v1/meals/pantry-consent", accessToken),
    );
    if (!response.ok) {
      return OFF;
    }

    const body = await readJsonBody(response);
    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as { enabled?: unknown }).enabled !== "boolean" ||
      typeof (body as { available?: unknown }).available !== "boolean"
    ) {
      return OFF;
    }
    const photo = (body as { photo?: unknown }).photo;
    return { ...(body as PantryConsent), photo: photo === true };
  } catch (reason) {
    console.error("pantry consent could not be resolved", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return OFF;
  }
}
