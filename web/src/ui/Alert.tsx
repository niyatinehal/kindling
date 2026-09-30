import type { ReactNode } from "react";

/**
 * `role="alert"` lives here rather than on each screen so that a screen cannot
 * forget it. Every existing test locates an error with getByRole("alert").
 */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-4 text-ink">
      {children}
    </p>
  );
}
