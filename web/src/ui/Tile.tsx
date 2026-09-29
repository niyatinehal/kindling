import { IconChip } from "./Icon";
import type { IconName, Tone } from "./Icon";

/**
 * A square way into one part of the app, for the home screen's grid.
 *
 * The link's accessible name is its label and nothing else — the icons are
 * `aria-hidden` — so a screen reader hears "Plan a meal, link", exactly what
 * the stacked button it replaces said.
 */
export function Tile({
  href,
  icon,
  tone,
  children,
}: {
  href: string;
  icon: IconName;
  tone: Tone;
  children: string;
}) {
  return (
    <a
      href={href}
      className="flex min-h-28 flex-col justify-between gap-4 rounded-card border border-line bg-surface p-4 text-ink shadow-card transition hover:border-accent/40 motion-safe:active:scale-[0.98]"
    >
      <IconChip name={icon} tone={tone} size="sm" />
      <span className="leading-snug font-semibold">{children}</span>
    </a>
  );
}
