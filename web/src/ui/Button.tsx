import type { ReactNode } from "react";

/**
 * `min-h-12` is 48px and is not negotiable — it is the documented minimum
 * touch target, and this app is opened by parents and grandparents.
 *
 * Only `primary` carries white text, and only ever on `bg-accent` (#15803D,
 * 5.02:1). `bg-accent-bright` (#16A34A) measures 3.30:1 against white and
 * fails AA for normal text, so it never appears here.
 */
const VARIANTS = {
  primary: "bg-accent text-surface hover:brightness-110",
  secondary: "bg-surface text-ink border border-line hover:bg-canvas",
  ghost: "bg-transparent text-accent hover:bg-canvas",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      {...(onClick !== undefined && { onClick })}
      className={`min-h-12 w-full rounded-card px-6 text-[1.0625rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]}`}
    >
      {children}
    </button>
  );
}
