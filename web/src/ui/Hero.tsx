import type { ReactNode } from "react";

/**
 * The card that holds the week's rings, on the landing and home screens.
 *
 * One component because it is one thing: the landing page shows a visitor the
 * very summary they will get after signing in, and two copies of its classes
 * had already started to differ by a padding value.
 *
 * It was a dark green band. On a screen whose job is to feel calm, the
 * darkest, largest shape on the page was the loudest thing a parent saw, so it
 * is now a plain card and the rings carry the colour.
 */
export function Hero({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface px-5 pt-5 pb-6 text-ink shadow-card">
      {children}
    </div>
  );
}
