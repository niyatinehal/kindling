import { proxyUpstream } from "../api/proxy";
import { readJsonBody } from "../api/readJsonBody";
import { callApi } from "../api/upstream";
import { createSupabaseServerClient } from "../supabase/server";
import type { MealSuggestion } from "./mealTypes";

/**
 * A few dishes for the home screen, before anyone has said what is in the
 * kitchen.
 *
 * It asks the suggestion endpoint with an empty pantry. That still applies
 * the profile's diet and conditions server-side, so nothing here is a dish the
 * person cannot eat — but with no pantry every dish is "missing" its core
 * ingredients, so the order is only the endpoint's tie-break. The screen calls
 * these ideas, not recommendations, for that reason.
 *
 * Never throws: every failure answers an empty list, and the home screen
 * simply leaves the row out.
 */
export async function dishIdeas(): Promise<MealSuggestion[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken === undefined) {
      return [];
    }

    const response = await proxyUpstream(() =>
      callApi("/api/v1/meals/suggest", accessToken, {
        method: "POST",
        body: { ingredients: [], slot: null },
      }),
    );
    if (!response.ok) {
      return [];
    }

    const body = await readJsonBody(response);
    const suggestions =
      typeof body === "object" && body !== null && "suggestions" in body
        ? (body as { suggestions: unknown }).suggestions
        : [];

    return Array.isArray(suggestions) ? suggestions.filter(isSuggestion) : [];
  } catch (reason) {
    console.error("dish ideas could not be resolved", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return [];
  }
}

/** Only what the home card reads is checked; the rest rides along untouched. */
function isSuggestion(value: unknown): value is MealSuggestion {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item["recipe_key"] === "string" &&
    typeof item["minutes"] === "number" &&
    typeof item["approx_kcal"] === "number"
  );
}
