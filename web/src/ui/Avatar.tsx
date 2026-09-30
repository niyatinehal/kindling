/**
 * A person's initial in a neutral circle, for the family screens. It is
 * decorative: the name is always written beside it, so it is `aria-hidden`.
 */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  const box = size === "sm" ? "size-10 text-base" : "size-12 text-lg";

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-display font-semibold bg-raised text-ink ${box}`}
    >
      {initial}
    </span>
  );
}
