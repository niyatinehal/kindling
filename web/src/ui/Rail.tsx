import { Children } from "react";
import type { ReactNode } from "react";

const WIDTH = {
  md: "w-[46%] max-w-52",
  lg: "w-[68%] max-w-72",
} as const;

/**
 * A row of cards that scrolls sideways, each snapping into place.
 *
 * It bleeds past the screen's side padding (`-mx-5 px-5`) so the first card
 * lines up with everything above it while the row still runs to the edge —
 * the part-hidden card on the right is what tells a thumb there is more.
 *
 * A list, so a screen reader announces how many there are.
 */
export function Rail({
  children,
  label,
  size = "md",
}: {
  children: ReactNode;
  label: string;
  /** `lg` for rows where the pictures are the point: two-thirds of the screen each. */
  size?: keyof typeof WIDTH;
}) {
  return (
    <ul
      aria-label={label}
      className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {Children.map(children, (child) => (
        <li className={`${WIDTH[size]} shrink-0 snap-start`}>{child}</li>
      ))}
    </ul>
  );
}
