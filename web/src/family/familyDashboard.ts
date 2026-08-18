import { proxyUpstream } from "../api/proxy";
import { readJsonBody } from "../api/readJsonBody";
import { callApi } from "../api/upstream";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * One member's panel. Every measure is OPTIONAL because the API omits categories
 * the member has hidden — absent, not null. The type mirrors that so the screen
 * has to handle "not shared" as a distinct case rather than rendering a zero.
 */
export type MemberPanel = {
  user_id: string;
  display_name: string;
  role: string;
  shared: string[];
  adherence_summary?: { workout_adherence: number | null; days_logged: number };
  water?: { water_ml: number };
  sleep?: { sleep_minutes: number; sleep_nights: number };
  workout_detail?: { workouts_completed: number; workouts_scheduled: number };
  meal_detail?: { meals_logged: number };
};

/**
 * The admin's family view, resolved server-side.
 *
 * The family id comes from `/auth/me` rather than the client, so a browser cannot
 * ask for a family it does not administer — the request cannot even be formed.
 * `null` means "not an admin of a family", which the screen renders as an
 * explanation rather than an error.
 */
export async function familyDashboard(): Promise<MemberPanel[] | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken === undefined) {
      return null;
    }

    const meResponse = await proxyUpstream(() => callApi("/api/v1/auth/me", accessToken));
    if (!meResponse.ok) {
      return null;
    }
    const me = await readJsonBody(meResponse);
    const family =
      typeof me === "object" && me !== null && "family" in me
        ? (me as { family: { id?: string; role?: string } | null }).family
        : null;

    if (family?.id === undefined || family.role !== "admin") {
      return null;
    }

    const response = await proxyUpstream(() =>
      callApi(`/api/v1/families/${family.id}/dashboard`, accessToken),
    );
    if (!response.ok) {
      return null;
    }

    const body = await readJsonBody(response);
    return typeof body === "object" && body !== null && "members" in body
      ? (body as { members: MemberPanel[] }).members
      : null;
  } catch (reason) {
    console.error("family dashboard could not be resolved", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return null;
  }
}
