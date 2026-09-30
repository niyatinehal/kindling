import type { ReactNode } from "react";

/**
 * A card led by a picture: the illustration fills the top, edge to edge, and
 * the words sit under it. For exercises and dishes, where a glance at the
 * picture says what the thing is before the name is read.
 *
 * `title` is a heading so a screen reader can move card to card; the picture is
 * decorative and carries no text of its own.
 */
export function MediaCard({
  art,
  title,
  meta,
  children,
}: {
  art: ReactNode;
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card bg-surface shadow-card">
      <div className="aspect-[4/3] overflow-hidden">{art}</div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <h3 className="leading-snug font-medium text-ink">{title}</h3>
        {meta !== undefined && <p className="text-sm text-muted">{meta}</p>}
        {children}
      </div>
    </article>
  );
}
