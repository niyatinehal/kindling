import type { ReactNode } from "react";

/**
 * `ink` is the deep-green card used for the one thing a screen most wants you
 * to look at. It is the only place `--color-accent-glow` appears as text, and
 * it works there because the ground is dark rather than white.
 */
const TONES = {
  surface: "bg-surface text-ink border border-line",
  ink: "bg-ink text-canvas",
} as const;

export function Card({
  children,
  tone = "surface",
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return <section className={`rounded-card p-5 shadow-card ${TONES[tone]}`}>{children}</section>;
}
