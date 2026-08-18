/**
 * Tracking shapes and the empty state — pure data, no transport.
 *
 * Split from `summary.ts` deliberately: that module imports `proxyUpstream`,
 * which pulls in `next/server`, which needs a `Request` global that jsdom does
 * not have. A component test importing the empty summary should not have to drag
 * a server runtime in behind it. `plan/planTypes.ts` and `plan/currentPlan.ts`
 * are split the same way, for the same reason.
 */
export type TrackingSummary = {
  water_ml: number;
  sleep_minutes: number;
  sleep_nights: number;
  workouts_completed: number;
  workouts_scheduled: number;
  workout_adherence: number | null;
  meals_logged: number;
  days: TrackingDay[];
};

/** One calendar day's totals — the series behind the dashboard charts. */
export type TrackingDay = {
  date: string;
  water_ml: number;
  sleep_minutes: number;
  workouts_completed: number;
  meals_logged: number;
};

export type TodayTick = { plan_exercise_id: string; status: string };

export type TrackingState = {
  summary: TrackingSummary;
  today: TodayTick[];
};

/** What the tiles show before anything has been logged, and if the API is down. */
export const EMPTY_SUMMARY: TrackingSummary = {
  water_ml: 0,
  sleep_minutes: 0,
  sleep_nights: 0,
  workouts_completed: 0,
  workouts_scheduled: 0,
  workout_adherence: null,
  meals_logged: 0,
  days: [],
};
