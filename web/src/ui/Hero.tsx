import type { ReactNode } from "react";

/**
 * The dark band at the top of the landing and home screens.
 *
 * One component because it is one thing: the landing page shows a visitor the
 * very hero they will get after signing in, and two copies of its classes had
 * already started to differ by a padding value.
 *
 * The two soft circles are decoration and nothing else — `aria-hidden`, behind
 * the content, and clipped by the band. They are what stops a solid slab of
 * green from reading as a banner ad.
 */
export function Hero({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-emphasis bg-[linear-gradient(160deg,rgb(255_255_255/0.06),transparent_55%)] px-5 pt-6 pb-7 text-on-emphasis shadow-card">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-12 size-48 rounded-full bg-emphasis-label/15 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -left-10 size-44 rounded-full bg-water-glow/10 blur-2xl"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
