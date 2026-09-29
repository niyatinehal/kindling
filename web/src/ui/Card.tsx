import type { ReactNode } from "react";

/**
 * `emphasis` is the card for the one thing a screen most wants you to look at.
 *
 * It was called `ink` and painted with `bg-ink text-canvas`, which worked only
 * while there was one theme. `ink` means "the darkest colour" as text and "the
 * card you should look at" as a ground, and those part company the moment a
 * theme swaps — remapping `ink` to a light value turned this card inside out
 * and put its label on near-white at 1.55:1. So it has its own tokens now, and
 * a name describing its job rather than its colour: in light it is darker than
 * the page, in dark it lifts above it.
 */
const TONES = {
  surface: "bg-surface text-ink border border-line",
  emphasis:
    "bg-emphasis bg-[radial-gradient(120%_90%_at_100%_0%,rgb(74_222_128/0.16),transparent_60%)] text-on-emphasis",
} as const;

export function Card({
  children,
  tone = "surface",
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <section className={`rounded-card p-5 shadow-card sm:p-6 ${TONES[tone]}`}>{children}</section>
  );
}
