/**
 * The plan shape as the API returns it — snake_case, because it is a wire type
 * rather than a domain type, and renaming it here would only hide the seam.
 */
export type PlanExerciseView = {
  exercise_key: string;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number | null;
};

export type PlanDayView = {
  day_of_week: number;
  exercises: PlanExerciseView[];
};

export type PlanView = {
  id: string;
  generator: string;
  created_at: string;
  days: PlanDayView[];
  profile_snapshot?: { applied_exclusions?: string[] } | null;
};

/**
 * Reads a plan out of an untrusted response body.
 *
 * Defensive on purpose: this parses a proxied payload, and a 502 envelope or an
 * empty body must resolve to "no plan" rather than throwing inside a render.
 */
export function readPlan(body: unknown): PlanView | null {
  if (typeof body !== "object" || body === null || !("plan" in body)) {
    return null;
  }
  const plan = (body as { plan: unknown }).plan;
  if (typeof plan !== "object" || plan === null || !("days" in plan)) {
    return null;
  }
  return plan as PlanView;
}
