/**
 * Date handling for tracking, kept in one place because "which day is this for"
 * is the only genuinely subtle part of logging.
 *
 * Everything is UTC calendar days. The `logged_for` column is a DATE, so an
 * entry belongs to a day rather than an instant — that is what lets a workout
 * finished at 11pm count for that day and sleep logged on waking count for the
 * night before. A future slice that cares about the member's own timezone will
 * change this function and nothing else.
 */
export function toCalendarDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function parseCalendarDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The window a summary covers: the last 7 calendar days including today.
 *
 * Rolling rather than calendar-week-aligned, because "this week" on a Monday
 * morning would otherwise be a nearly empty tile that looks like lost data.
 */
export function weekWindow(now: Date): { from: Date; to: Date; days: number } {
  const to = toCalendarDay(now);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 6);
  return { from, to, days: 7 };
}
