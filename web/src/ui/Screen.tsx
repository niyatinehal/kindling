import type { ReactNode } from "react";

import { ThemeToggle } from "./ThemeToggle";

/**
 * The one-column frame every screen sits in. The narrow max width is doing
 * real work: comfortable line length is most of what makes body text feel
 * effortless, and this app is read on phones by people who are not
 * necessarily wearing their glasses.
 *
 * The theme toggle lives here rather than on a screen, because it has to be
 * reachable from all of them — including the landing page and sign-in, which
 * have no chrome of their own to hang it off and no session to remember a
 * preference against.
 */
export function Screen({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-8">
      {/*
        The row exists even with no title, so the toggle keeps the same position
        on every screen. `justify-between` with an empty first child would
        collapse it to the left, hence `ms-auto` on the toggle's wrapper.
      */}
      <div className="flex items-start justify-between gap-3">
        {title !== undefined && (
          <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
        )}
        <div className="ms-auto">
          <ThemeToggle />
        </div>
      </div>
      {children}
    </main>
  );
}
