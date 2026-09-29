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
  primary: "bg-accent text-surface shadow-button hover:brightness-110",
  secondary: "bg-surface text-ink border border-line hover:border-accent/40 hover:bg-canvas",
  ghost: "bg-transparent text-accent hover:bg-canvas",
} as const;

/**
 * The shape both primitives share. Pills, because a full-width rounded
 * rectangle reads as a form field at a glance, and the one thing a button must
 * never be mistaken for is something you type into. `active:scale` is the
 * press a thumb expects from a phone app; `motion-safe` keeps it away from
 * anyone who has asked their OS for less movement.
 */
export const BUTTON_SHAPE =
  "flex min-h-13 w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-center text-[1.0625rem] leading-snug font-semibold transition motion-safe:active:scale-[0.98]";

export type Variant = keyof typeof VARIANT_CLASSES;

export type LinkVariant = Exclude<Variant, "ghost">;
