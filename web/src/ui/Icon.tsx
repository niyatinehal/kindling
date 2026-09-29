/**
 * The handful of icons this app uses, drawn inline.
 *
 * Inline rather than a package because there are sixteen of them and they
 * never change; an icon library would ship hundreds to use these. They share
 * one grid (24px, 2px round stroke), which is what makes a set look like a set.
 *
 * Always decorative: every icon sits beside words that say the same thing, so
 * each is `aria-hidden` and none has a label of its own. An icon that is the
 * only way to understand a control needs text, not a title attribute.
 */
const PATHS = {
  droplet:
    "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7Z",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41",
  activity:
    "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
  utensils:
    "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  calendar:
    "M8 2v4 M16 2v4 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M3 10h18",
  chart: "M3 3v16a2 2 0 0 0 2 2h16 M18 17V9 M13 17V5 M8 17v-3",
  heart:
    "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
  shield:
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z",
  check: "M20 6 9 17l-5-5",
  chevronLeft: "m15 18-6-6 6-6",
  arrowRight: "M5 12h14 M12 5l7 7-7 7",
  plus: "M5 12h14 M12 5v14",
  minus: "M5 12h14",
  logOut: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * The tinted square an icon sits in. Categories get their own colour pair
 * from globals.css, so water is blue everywhere it appears.
 */
export const TONE_CLASSES = {
  water: "bg-water-soft text-water",
  sleep: "bg-sleep-soft text-sleep",
  move: "bg-move-soft text-move",
  meal: "bg-meal-soft text-meal",
  family: "bg-family-soft text-family",
} as const;

export type Tone = keyof typeof TONE_CLASSES;

export function IconChip({
  name,
  tone,
  size = "md",
}: {
  name: IconName;
  tone: Tone;
  size?: "sm" | "md" | "lg";
}) {
  const box = { sm: "size-9 rounded-full", md: "size-10 rounded-full", lg: "size-12 rounded-full" }[
    size
  ];
  const glyph = { sm: "size-[1.125rem]", md: "size-5", lg: "size-6" }[size];
  return (
    <span className={`grid shrink-0 place-items-center ${box} ${TONE_CLASSES[tone]}`}>
      <Icon name={name} className={glyph} />
    </span>
  );
}
