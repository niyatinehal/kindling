import { Icon, IconChip } from "./Icon";
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
      className="group flex min-h-32 flex-col justify-between gap-4 rounded-card border border-line bg-surface p-4 text-ink shadow-card transition hover:border-accent/40 motion-safe:active:scale-[0.98]"
    >
      <div className="flex items-start justify-between">
        <IconChip name={icon} tone={tone} />
        <Icon
          name="arrowRight"
          className="size-5 text-muted transition motion-safe:group-hover:translate-x-0.5"
        />
      </div>
      <span className="text-[1.0625rem] leading-snug font-semibold">{children}</span>
    </a>
  );
}
