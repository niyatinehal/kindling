const SIZE = 18;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The one loading indicator in the app. Sized in `em` rather than pixels so it
 * matches whatever label it sits beside instead of being drawn for the one
 * button it was first added to.
 *
 * Decoration, deliberately: every place this renders, the button beside it is
 * disabled and usually says "Building…" already. A `role="status"` here would
 * announce the same fact a second time.
 *
 * `currentColor` for the same reason `ProgressRing` uses it — the label's
 * colour differs per variant (`text-surface` on primary, `text-ink` on
 * secondary, `text-accent` on ghost) and a hardcoded stroke would be wrong on
 * two of the three.
 */
export function Spinner() {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden="true"
      className="size-[1.125em] shrink-0 animate-spin motion-reduce:animate-none"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.3}
        strokeWidth={STROKE}
      />
      {/*
        A quarter-turn arc, which is what makes the rotation readable. A full
        ring spinning looks identical at every angle.
      */}
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${CIRCUMFERENCE / 4} ${CIRCUMFERENCE}`}
      />
    </svg>
  );
}
