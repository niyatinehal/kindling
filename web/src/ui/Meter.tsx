/**
 * A single ratio against a limit.
 *
 * A meter rather than a two-slice pie or a one-bar chart: the data is one number
 * measured against one target, and the form heuristic is explicit that a lone
 * ratio is a meter and a lone value is a stat tile. Neither is a chart.
 *
 * The track is the same hue as the fill, several steps lighter, so the pair reads
 * as one scale rather than as two categories.
 */
export function Meter({
  value,
  max,
  label,
  caption,
}: {
  value: number;
  max: number;
  label: string;
  caption: string;
}) {
  // Clamped, because a week with more logged than scheduled is real — someone can
  // do an extra session — and a bar overflowing its track reads as a rendering bug
  // rather than as good news.
  const ratio = max <= 0 ? 0 : Math.min(1, value / max);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-muted">{label}</span>
        {/* Text wears a text token; the filled track beside it carries the colour. */}
        <span className="text-sm font-semibold text-ink">{caption}</span>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-canvas"
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${String(Math.round(ratio * 100))}%` }}
        />
      </div>
    </div>
  );
}
