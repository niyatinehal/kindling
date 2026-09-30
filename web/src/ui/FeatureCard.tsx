import type { ReactNode } from "react";

/**
 * A big picture with its words laid over the bottom of it — for the one thing
 * on a screen that should be seen first: the landing page's opening, today's
 * workout on home.
 *
 * The text sits on a dark gradient rather than straight on the picture, so it
 * stays legible whatever the photo underneath is doing, in both themes. That
 * is why its colours are fixed white rather than theme tokens: the ground is
 * always the gradient, never the page.
 *
 * Given `href`, the whole card is the link, and its text is the link's name.
 */
export function FeatureCard({
  picture,
  eyebrow,
  title,
  detail,
  href,
  ratio = "4/3",
  titleAs: Title = "p",
  children,
}: {
  picture: ReactNode;
  eyebrow?: string;
  title: string;
  detail?: string;
  href?: string;
  ratio?: "4/3" | "4/5";
  /** `h1` when the card opens the page, so the page keeps its one heading. */
  titleAs?: "p" | "h1" | "h2";
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className="absolute inset-0">{picture}</div>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-5 text-white">
        {eyebrow !== undefined && <p className="text-sm font-medium text-white/80">{eyebrow}</p>}
        <Title className="text-2xl leading-tight font-semibold tracking-tight">{title}</Title>
        {detail !== undefined && <p className="text-white/85">{detail}</p>}
        {children}
      </div>
    </>
  );

  const frame = `relative block overflow-hidden rounded-card bg-raised ${
    ratio === "4/5" ? "aspect-[4/5]" : "aspect-[4/3]"
  }`;

  return href === undefined ? (
    <div className={frame}>{body}</div>
  ) : (
    <a href={href} className={`${frame} transition motion-safe:active:scale-[0.99]`}>
      {body}
    </a>
  );
}
