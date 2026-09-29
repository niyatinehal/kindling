import { fractionOf } from "../tracking/targets";

const SIZE = 80;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * One figure, drawn as a proportion of its target.
 *
 * Built for a dark ground — the hero, whose `emphasis` token is darker than the
 * page in light and lighter than it in dark, but dark in both. That is why the
 * fill may be `accent-glow`, which measures 7.00:1 there and 6.23:1 in dark;
 * on a white card it would be 1.74:1 and effectively invisible. Dropping one of
 * these onto a `surface` card needs a tone prop and a different fill, not a
 * copy-paste.
 *
 * Text and track are `currentColor`, so the ring takes its legibility from
 * whatever it is placed inside rather than naming a colour that only suits one
 * container.
 *
 * `display` is the caller's business rather than a format prop. Litres, hours
 * and a plain count have nothing in common, and formatting here would mean a
 * switch on units that only ever grows.
 */
export function ProgressRing({
  label,
  value,
  target,
  display,
  color = "var(--color-accent-bright)",
}: {
  label: string;
  value: number;
  target: number;
  display: string;
  /** The fill. Defaults to the brand glow; the hero passes each category's own. */
  color?: string;
}) {
  const fraction = fractionOf(value, target);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative grid place-items-center" style={{ width: SIZE, height: SIZE }}>
        {/*
          Rotated so the fill starts at twelve o'clock rather than three, which
          is where people expect a dial to begin.
        */}
        <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden="true">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={STROKE}
          />
          {fraction !== null && (
            <circle
              data-fill={String(fraction)}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            />
          )}
        </svg>
        <span className="absolute text-base font-semibold tabular-nums">{display}</span>
      </div>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
