import type { ReactNode } from "react";

/**
 * The week's rings, on the landing and home screens.
 *
 * One component because it is one thing: the landing page shows a visitor the
 * very summary they will get after signing in, and two copies of its classes
 * had already started to differ by a padding value.
 *
 * No card around it. The rings are the most important thing on the screen,
 * and on a near-black page they read best with nothing framing them — the
 * glow does the job a border would.
 */
export function Hero({ children }: { children: ReactNode }) {
  return <div className="py-2 text-ink">{children}</div>;
}
