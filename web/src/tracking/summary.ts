import { proxyUpstream } from "../api/proxy";
import { readJsonBody } from "../api/readJsonBody";
import { callApi } from "../api/upstream";
import { createSupabaseServerClient } from "../supabase/server";
import { EMPTY_SUMMARY } from "./summaryTypes";
import type { TodayTick, TrackingState, TrackingSummary } from "./summaryTypes";

/**
 * This week's totals plus today's workout ticks.
 *
 * Never throws. On any failure the tiles fall back to `EMPTY_SUMMARY`, which
 * renders as zeroes — and zero is the honest reading of "we could not find any
 * logs", unlike a spinner that never resolves or a crashed render.
 */
export async function trackingState(): Promise<TrackingState> {
  const empty: TrackingState = { summary: EMPTY_SUMMARY, today: [] };

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken === undefined) {
      return empty;
    }

    const response = await proxyUpstream(() => callApi("/api/v1/tracking/summary", accessToken));
    if (!response.ok) {
      return empty;
    }

    const body = await readJsonBody(response);
    if (typeof body !== "object" || body === null || !("summary" in body)) {
      return empty;
    }

    const parsed = body as { summary: TrackingSummary; today?: TodayTick[] };
    return { summary: { ...EMPTY_SUMMARY, ...parsed.summary }, today: parsed.today ?? [] };
  } catch (reason) {
    console.error("tracking summary could not be resolved", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return empty;
  }
}
