import { fractionOf } from "../tracking/targets";

/**
 * The week's shape at a glance, next to today's rings.
 *
 * Deliberately not a chart: `/dashboard` already draws those, with axes and
 * hover values. This answers one cruder question — did the week happen — and it
 * has to answer it in the corner of a screen someone glances at.
 *
 * A day with nothing logged renders as an empty track rather than a zero-height
 * bar. They look similar and mean different things: "no water that day" versus
 * "we have no record of that day", and only the second is true of a day nobody
 * opened the app.
 */
export function WeekStrip({
  days,
  target,
  label,
  empty,
}: {
  days: { date: string; value: number }[];
  target: number;
  label: string;
  empty?: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-muted">{label}</p>

      {days.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <div className="mt-3 flex h-12 items-end gap-3.5 px-1">
          {days.map(({ date, value }) => {
            const fraction = value === 0 ? null : fractionOf(value, target);

            return (
              <div
                key={date}
                data-day={date}
                className="flex h-full flex-1 items-end rounded-sm bg-raised"
              >
                {fraction !== null && (
                  <div
                    data-fill={String(fraction)}
                    className="w-full rounded-sm bg-accent"
                    style={{ height: `${Math.max(fraction * 100, 8)}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
