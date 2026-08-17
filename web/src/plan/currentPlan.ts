import { proxyUpstream } from "../api/proxy";
import { readJsonBody } from "../api/readJsonBody";
import { callApi } from "../api/upstream";
import { createSupabaseServerClient } from "../supabase/server";
import { readPlan } from "./planTypes";
import type { PlanView } from "./planTypes";

/**
 * The caller's active plan, resolved server-side so the screen renders with it
 * already in place rather than flashing empty and filling in.
 *
 * Never throws — every failure answers `null`, which the screen renders as "no
 * plan yet" plus a build button. That is the honest fallback: it claims nothing
 * and leads somewhere useful.
 */
export async function currentPlan(): Promise<PlanView | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken === undefined) {
      return null;
    }

    const response = await proxyUpstream(() => callApi("/api/v1/plans/current", accessToken));
    if (!response.ok) {
      return null;
    }

    return readPlan(await readJsonBody(response));
  } catch (reason) {
    console.error("current plan could not be resolved", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return null;
  }
}
