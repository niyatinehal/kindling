import type { ReactNode } from "react";

/**
 * A link that reads as a button. Two screens need one — the landing screen's
 * sign-in action and the sign-in screen's "Continue with Google" — and both
 * NAVIGATE, so `<button>` would be the wrong element and the existing landing
 * test would stop finding it with `getByRole("link")`.
 *
 * It exists as a primitive rather than as a class string copied into each
 * screen so that the button look is defined once. Keep the variants in step
 * with `Button`'s: only `--color-accent` (5.02:1 against white) ever carries
 * white text, never `--color-accent-bright` (3.30:1).
 */
const VARIANTS = {
  primary: "bg-accent text-surface",
  secondary: "border border-line bg-surface text-ink",
} as const;

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
}) {
  return (
    <a
      href={href}
      className={`flex min-h-12 w-full items-center justify-center rounded-card px-6 text-[1.0625rem] font-semibold ${VARIANTS[variant]}`}
    >
      {children}
    </a>
  );
}
