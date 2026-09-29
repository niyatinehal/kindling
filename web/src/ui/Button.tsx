import type { ReactNode } from "react";

import { Spinner } from "./Spinner";
import { BUTTON_SHAPE, VARIANT_CLASSES } from "./variants";
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
  inline = false,
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
  /**
   * Size to the label instead of filling the row. For secondary actions that
   * sit beside something else — a full-width button says "this is the thing
   * to do on this screen", and only one thing on a screen should say that.
   */
  inline?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      {...(onClick !== undefined && { onClick })}
      className={`${BUTTON_SHAPE} ${inline ? "w-auto shrink-0 px-4 whitespace-nowrap" : "w-full px-6"} disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${VARIANT_CLASSES[variant]}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
