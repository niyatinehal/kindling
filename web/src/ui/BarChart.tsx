/**
 * A weekly column chart, in plain SVG.
 *
 * No charting library: the whole thing is seven rectangles and a baseline, and a
 * dependency for that would cost more bundle than the app's own code. It is also
 * why there is nothing to configure — every chart on the dashboard is the same
 * form, so the specs live here once.
 *
 * Marks follow the fixed specs: columns capped at 24px so the band keeps its air,
 * a 4px rounded cap with a square baseline, a 2px surface gap between neighbours,
 * and a hairline recessive baseline. One series means ONE colour for every column
 * — colouring darker-where-bigger would double-encode height as hue and burn the
 * only free channel on information the chart already shows.
 *
 * Labels are selective by design. The extreme and today carry a value; the rest
 * are read from the axis and the hover title. A number over every column is the
 * fastest way to make direct labels stop working.
 */
export type BarDatum = {
  /** Axis label — one or two characters, e.g. a weekday initial. */
  label: string;
  value: number;
  /** Human-readable value for the hover title, with units. */
  title: string;
  /** Renders the column as today's, so the reader can find themselves. */
  isToday?: boolean;
};

const BAR_MAX_WIDTH = 24;
const BAR_GAP = 2;
const CAP_RADIUS = 4;
const PLOT_HEIGHT = 96;
const LABEL_BAND = 18;
const VALUE_BAND = 14;

export function BarChart({
  data,
  target,
  targetLabel,
  formatValue,
  color = "var(--color-accent)",
}: {
  data: readonly BarDatum[];
  /** An optional reference line — a daily goal, drawn behind the marks. */
  target?: number | undefined;
  targetLabel?: string | undefined;
  formatValue?: ((value: number) => string) | undefined;
  /**
   * Bars and target line. Each dashboard chart passes its category's colour,
   * which palette.test.ts holds to 3:1 on a card, the same bar the accent met.
   */
  color?: string;
}) {
  const width = 320;
  const height = PLOT_HEIGHT + LABEL_BAND + VALUE_BAND;
  const band = width / Math.max(data.length, 1);
  const barWidth = Math.min(BAR_MAX_WIDTH, band - BAR_GAP);

  // The scale includes the target, so a goal line can never sit off-canvas. The
  // `|| 1` guards a week of zeroes, where every column is flat and the axis is
  // arbitrary — the chart still has to render, and it renders empty rather than
  // dividing by nothing.
  const peak = Math.max(...data.map((d) => d.value), target ?? 0) || 1;
  const scale = (value: number) => (value / peak) * PLOT_HEIGHT;
  const highest = Math.max(...data.map((d) => d.value));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      // The accessible name comes from the caller's heading; the table of values
      // lives in the hover titles and the tiles above, so nothing is colour-only.
      aria-label={targetLabel ?? undefined}
    >
      {target !== undefined && target > 0 && (
        <line
          x1={0}
          x2={width}
          y1={VALUE_BAND + PLOT_HEIGHT - scale(target)}
          y2={VALUE_BAND + PLOT_HEIGHT - scale(target)}
          // 5.02:1 on a light card, 7.63:1 on a dark one. This was
          // `accent-glow`, which measures 1.74:1 on white — the line the whole
          // chart is read against, all but invisible.
          stroke={color}
          strokeDasharray="4 4"
          strokeWidth={1}
        />
      )}

      {/* Hairline, solid, one step off the surface — present but recessive. */}
      <line
        x1={0}
        x2={width}
        y1={VALUE_BAND + PLOT_HEIGHT}
        y2={VALUE_BAND + PLOT_HEIGHT}
        stroke="var(--color-line)"
        strokeWidth={1}
      />

      {data.map((datum, index) => {
        const barHeight = datum.value === 0 ? 0 : Math.max(scale(datum.value), CAP_RADIUS);
        const x = index * band + (band - barWidth) / 2;
        const y = VALUE_BAND + PLOT_HEIGHT - barHeight;
        // Labelled only where it earns the ink: the week's peak, and today.
        const showValue = datum.value > 0 && (datum.value === highest || datum.isToday === true);

        return (
          <g key={datum.label + String(index)}>
            {barHeight > 0 && (
              <path
                d={[
                  `M ${x} ${VALUE_BAND + PLOT_HEIGHT}`,
                  `V ${y + CAP_RADIUS}`,
                  `Q ${x} ${y} ${x + CAP_RADIUS} ${y}`,
                  `H ${x + barWidth - CAP_RADIUS}`,
                  `Q ${x + barWidth} ${y} ${x + barWidth} ${y + CAP_RADIUS}`,
                  `V ${VALUE_BAND + PLOT_HEIGHT}`,
                  "Z",
                ].join(" ")}
                fill={color}
              >
                <title>{datum.title}</title>
              </path>
            )}

            {/* An empty day still gets a hit target, so hovering it says "nothing
                logged" rather than nothing at all. */}
            {barHeight === 0 && (
              <rect x={x} y={VALUE_BAND} width={barWidth} height={PLOT_HEIGHT} fill="transparent">
                <title>{datum.title}</title>
              </rect>
            )}

            {showValue && (
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                // Text wears a text token, never the mark's colour.
                fill="var(--color-ink)"
              >
                {formatValue ? formatValue(datum.value) : String(datum.value)}
              </text>
            )}

            <text
              x={x + barWidth / 2}
              y={height - 5}
              textAnchor="middle"
              fontSize={10}
              fill={datum.isToday === true ? "var(--color-ink)" : "var(--color-muted)"}
              fontWeight={datum.isToday === true ? 600 : 400}
            >
              {datum.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
