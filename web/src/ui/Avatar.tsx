/**
 * A person's initial in a coloured circle, for the family screens.
 *
 * The colour comes from the name rather than the role, so everyone in a
 * household looks different from everyone else — five members who are all
 * "adult" would otherwise be five identical circles. It is decorative: the
 * name is always written beside it, so it is `aria-hidden`.
 */
const TONES = [
  "bg-water-soft text-water",
  "bg-sleep-soft text-sleep",
  "bg-move-soft text-move",
  "bg-meal-soft text-meal",
  "bg-family-soft text-family",
] as const;

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const box = size === "sm" ? "size-10 text-base" : "size-12 text-lg";

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-display font-semibold ${box} ${TONES[hash % TONES.length]}`}
    >
      {initial}
    </span>
  );
}
