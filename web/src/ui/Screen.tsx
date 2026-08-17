import type { ReactNode } from "react";

/**
 * The one-column frame every screen sits in. The narrow max width is doing
 * real work: comfortable line length is most of what makes body text feel
 * effortless, and this app is read on phones by people who are not
 * necessarily wearing their glasses.
 */
export function Screen({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-8">
      {title !== undefined && (
        <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
      )}
      {children}
    </main>
  );
}
