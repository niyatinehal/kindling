import type { ReactNode } from "react";

import { Spinner } from "./Spinner";
import { VARIANT_CLASSES } from "./variants";
import type { Variant } from "./variants";

/**
 * `min-h-12` is 48px and is not negotiable — it is the documented minimum
 * touch target, and this app is opened by parents and grandparents.
 *
 * The variant class strings live in `./variants` — shared with `LinkButton`
 * so the two can never drift apart again.
 */
export type ButtonVariant = Variant;

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
  loading = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
  /**
   * True while the action this button started is still in flight.
   *
   * Implies `disabled` rather than sitting beside it. Every call site is
   * mid-POST when it passes this, and a loading button that still took a press
   * would be the double-submit it exists to prevent — so the two cannot be set
   * inconsistently.
   */
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      {...(onClick !== undefined && { onClick })}
      className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-card px-6 text-[1.0625rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
