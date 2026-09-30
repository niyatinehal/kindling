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
 * `danger` is for the one irreversible action, so it cannot be mistaken for an
 * ordinary accent-coloured link beside it.
 *
 * `ghost` and `danger` are `Button`-only: nothing in this app renders either as a link, so
 * `LinkButton` is typed to the variants it can actually style rather than
 * being handed one it has no look for.
 */
export const VARIANT_CLASSES = {
  primary: "bg-accent text-surface hover:brightness-110",
  secondary: "border border-line bg-surface text-ink hover:bg-raised",
  ghost: "bg-transparent text-accent hover:bg-raised",
  danger: "bg-transparent text-danger hover:bg-raised",
} as const;

/**
 * The shape both primitives share. A rectangle with the control radius, not a
 * pill: pills were a large part of why the app read as a toy. Fields sit on a
 * raised fill and buttons do not, which keeps the two apart at a glance.
 * `active:scale` is the press a thumb expects from a phone app; `motion-safe`
 * keeps it away from anyone who has asked their OS for less movement.
 */
export const BUTTON_SHAPE =
  "flex min-h-12 items-center justify-center gap-2 rounded-control py-2.5 text-center text-base leading-snug font-medium transition motion-safe:active:scale-[0.99]";

export type Variant = keyof typeof VARIANT_CLASSES;

export type LinkVariant = Exclude<Variant, "ghost" | "danger">;
