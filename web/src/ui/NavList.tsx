import { useId } from "react";
import type { ReactNode } from "react";

import { Icon } from "./Icon";
import type { IconName, Tone } from "./Icon";

/**
 * A grouped list of places to go, one row each: icon, label, an optional line
 * of status, and a chevron.
 *
 * The link's accessible name is the label alone — set with `aria-label` — and
 * the status line is its description, so a screen reader hears "See my family,
 * link, Your family is set up" rather than both run together as one name.
 */
export function NavList({ children }: { children: ReactNode }) {
  return (
    <nav className="overflow-hidden rounded-card border border-line/70 bg-surface">
      <ul className="divide-y divide-line/70">{children}</ul>
    </nav>
  );
}

const ICON_TONE: Record<Tone, string> = {
  water: "text-water",
  sleep: "text-sleep",
  move: "text-move",
  meal: "text-meal",
  family: "text-family",
};

export function NavRow({
  href,
  icon,
  tone,
  label,
  detail,
}: {
  href: string;
  icon: IconName;
  tone: Tone;
  label: string;
  detail?: string | undefined;
}) {
  const detailId = useId();

  return (
    <li>
      <a
        href={href}
        aria-label={label}
        {...(detail !== undefined && { "aria-describedby": detailId })}
        className="flex min-h-16 items-center gap-4 px-5 py-3 transition hover:bg-raised"
      >
        {/*
          A thin bar of the category's colour down the left edge: the one
          splash of colour per row, and it glows in the dark theme.
        */}
        <span
          aria-hidden="true"
          className={`h-8 w-1 shrink-0 rounded-full bg-current dark:shadow-[0_0_10px_currentColor] ${ICON_TONE[tone]}`}
        />
        <Icon name={icon} className={`size-5 ${ICON_TONE[tone]}`} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold text-ink">{label}</span>
          {detail !== undefined && (
            <span id={detailId} className="text-sm text-muted">
              {detail}
            </span>
          )}
        </span>
        <Icon name="chevronRight" className="size-5 text-muted" />
      </a>
    </li>
  );
}
