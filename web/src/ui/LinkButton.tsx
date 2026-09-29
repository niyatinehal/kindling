import type { ReactNode } from "react";

import { BUTTON_SHAPE, VARIANT_CLASSES } from "./variants";
import type { LinkVariant } from "./variants";

/**
 * A link that reads as a button. Two screens need one — the landing screen's
 * sign-in action and the sign-in screen's "Continue with Google" — and both
 * NAVIGATE, so `<button>` would be the wrong element and the existing landing
 * test would stop finding it with `getByRole("link")`.
 *
 * The variant class strings live in `./variants`, shared with `Button`, so
 * this can no longer drift from it the way it once did. There is no `ghost`
 * entry here: nothing in this app renders a ghost link, so `variant` is typed
 * to the two `Button` looks this component can actually style.
 */
export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: LinkVariant;
}) {
  return (
    <a href={href} className={`${BUTTON_SHAPE} w-full px-6 ${VARIANT_CLASSES[variant]}`}>
      {children}
    </a>
  );
}
