/**
 * The one place `Button` and `LinkButton`'s shared looks are defined. Both
 * primitives stay separate components on purpose — `<a>` cannot take
 * `disabled`/`type`/`onClick`, and `landing.test.tsx` locates the CTA with
 * `getByRole("link")` — but the class strings for a shared variant name must
 * not drift, which is exactly what happened before this module existed:
 * `Button`'s `primary`/`secondary` carried `hover:` states and a `transition`
 * that `LinkButton`'s did not, so "Continue with Google" (a link) looked
 * identical to a secondary `Button` at rest and did not react on hover.
 *
 * Only `primary` ever carries white text, and only ever on `bg-accent`
 * (#15803D, 5.02:1 against white). `bg-accent-bright` (#16A34A) measures
 * 3.30:1 and fails AA for normal text, so it never appears here.
 *
 * `ghost` is `Button`-only: nothing in this app renders a ghost link, so
 * `LinkButton` is typed to the variants it can actually style rather than
 * being handed one it has no look for.
 */
export const VARIANT_CLASSES = {
  primary: "bg-accent text-surface hover:brightness-110",
  secondary: "bg-surface text-ink border border-line hover:bg-canvas",
  ghost: "bg-transparent text-accent hover:bg-canvas",
} as const;

export type Variant = keyof typeof VARIANT_CLASSES;

export type LinkVariant = Exclude<Variant, "ghost">;
