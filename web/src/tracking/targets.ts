/**
 * The daily targets, shared rather than redeclared.
 *
 * They were local constants in `DashboardView`, which was fine while the
 * dashboard was the only screen that drew a target line. `/home` now draws
 * rings against the same numbers, and two copies of "what counts as a full
 * day" would drift the moment one screen was tuned.
 *
 * These are app-wide constants, NOT personal goals. Nothing about them is
 * derived from the person looking at them, so no screen may describe them as
 * "your" target until they actually are.
 */
export const WATER_TARGET_ML = 2000;

export const SLEEP_TARGET_MINUTES = 420;

/**
 * How full a ring is, as a fraction between 0 and 1.
 *
 * `null` means there is no denominator to measure against — which is a real
 * state, not an error: someone with no plan has no scheduled workouts, and a
 * ring drawn against a target of zero would either divide by nothing or invent
 * one. Callers render the track and the figure, and no fill.
 */
export const fractionOf = (value: number, target: number): number | null => {
  if (target <= 0) return null;
  return Math.max(0, Math.min(value / target, 1));
};
