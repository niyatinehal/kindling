import type { ReactNode } from "react";

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
      className={`min-h-12 w-full rounded-card px-6 text-[1.0625rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </button>
  );
}
