import { useId } from "react";
import type { ReactNode } from "react";

import { Icon } from "./Icon";
import type { IconName } from "./Icon";

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
    <nav className="overflow-hidden rounded-card bg-surface">
      <ul className="divide-y divide-line">{children}</ul>
    </nav>
  );
}

export function NavRow({
  href,
  icon,
  label,
  detail,
}: {
  href: string;
  icon: IconName;
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
        <Icon name={icon} className="size-5 text-muted" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold text-ink">{label}</span>
          {detail !== undefined && (
            <span id={detailId} className="text-sm text-muted">
              {detail}
            </span>
          )}
        </span>
        <Icon name="chevronRight" className="size-4 text-muted" />
      </a>
    </li>
  );
}
