/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CHROME_COLOUR } from "../theme";

/**
 * `globals.css` claims its contrast figures are "measured, not estimated". This
 * is what makes that claim enforceable rather than aspirational: it recomputes
 * every one of them from the values actually in the file, so a palette tweak
 * that drops a pair below its threshold fails here instead of shipping.
 *
 * It also guards the one structural weakness of the theme. Dark is declared
 * twice — once behind a media query, once behind an attribute selector — and
 * CSS offers no way to say "either of these", so the duplication is forced.
 * Duplication that nothing checks is duplication that rots.
 */
const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/** Declarations inside the rule opened by `selector`, up to its closing brace. */
const block = (selector: string): Record<string, string> => {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThan(-1);

  const body = css.slice(start + selector.length, css.indexOf("}", start));
  const found: Record<string, string> = {};

  for (const [, name, value] of body.matchAll(/(--c-[a-z-]+)\s*:\s*([^;]+);/g)) {
    // Both groups are matched whenever the pattern is, but
    // `noUncheckedIndexedAccess` cannot know that; skipping the impossible case
    // is cheaper than asserting something the compiler would have to take on
    // trust.
    if (name === undefined || value === undefined) continue;
    found[name] = value.trim();
  }

  return found;
};

const light = () => block(":root {");
const mediaDark = () => block(':root:not([data-theme="light"]) {');
const attrDark = () => block(':root[data-theme="dark"] {');

/** WCAG 2.1 relative luminance. */
const luminance = (hex: string): number => {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

/**
 * Every pair the palette comment makes a promise about, with the threshold that
 * promise implies. 4.5 is AA for normal text, 7 is AAA, and 3 is the floor for
 * non-text UI — which is the only bar a progress fill has to clear.
 */
const PAIRS: { name: string; fg: string; bg: string; min: number }[] = [
  { name: "body text", fg: "--c-ink", bg: "--c-canvas", min: 7 },
  { name: "secondary text", fg: "--c-muted", bg: "--c-canvas", min: 4.5 },
  { name: "secondary text on a card", fg: "--c-muted", bg: "--c-surface", min: 4.5 },
  { name: "primary button", fg: "--c-surface", bg: "--c-accent", min: 4.5 },
  { name: "secondary button", fg: "--c-ink", bg: "--c-surface", min: 7 },
  { name: "ghost button", fg: "--c-accent", bg: "--c-canvas", min: 4.5 },
  { name: "emphasis card text", fg: "--c-on-emphasis", bg: "--c-emphasis", min: 7 },
  { name: "emphasis card label", fg: "--c-emphasis-label", bg: "--c-emphasis", min: 4.5 },
  // Non-text: the ring fill and the chart's target line.
  { name: "progress fill on a card", fg: "--c-accent-bright", bg: "--c-surface", min: 3 },
  { name: "chart target line", fg: "--c-accent", bg: "--c-surface", min: 3 },
  // Category colours carry short labels on their own soft chip ("You can cook
  // this right now"), so they are held to the text threshold there, and to
  // the graphics threshold as icons on a plain card.
  ...(["water", "sleep", "move", "meal", "family"] as const).flatMap((c) => [
    { name: `${c} label on its chip`, fg: `--c-${c}`, bg: `--c-${c}-soft`, min: 4.5 },
    { name: `${c} icon on a card`, fg: `--c-${c}`, bg: "--c-surface", min: 3 },
  ]),
  ...(["water", "sleep", "meal"] as const).map((c) => ({
    name: `${c} ring on the hero`,
    fg: `--c-${c}-glow`,
    bg: "--c-emphasis",
    min: 3,
  })),
];

describe("palette", () => {
  it("declares dark identically in both places it has to be declared", () => {
    expect(mediaDark()).toEqual(attrDark());
  });

  // A token present in light and missing from dark does not error — it inherits
  // the light value, putting one light colour on an otherwise dark page. Silent,
  // and easy to miss on a screen nobody opened in dark.
  it("gives every light token a dark counterpart", () => {
    expect(Object.keys(attrDark()).sort()).toEqual(Object.keys(light()).sort());
  });

  it.each([
    ["light", light],
    ["dark", attrDark],
  ])("meets its stated contrast thresholds in %s", (_theme, tokens) => {
    const palette = tokens();

    const measured = PAIRS.map(({ name, fg, bg, min }) => {
      const foreground = palette[fg];
      const background = palette[bg];
      expect({ fg, defined: foreground !== undefined }).toEqual({ fg, defined: true });
      expect({ bg, defined: background !== undefined }).toEqual({ bg, defined: true });

      return {
        name,
        ratio: Number(contrast(foreground as string, background as string).toFixed(2)),
        min,
      };
    });

    // Reported as a set so a failure names every pair that regressed, not just
    // the first one.
    expect(measured.filter(({ ratio, min }) => ratio < min)).toEqual([]);
  });

  // The browser paints its chrome from a <meta> tag before any stylesheet is
  // parsed, so this one value has to be duplicated into TypeScript. This is the
  // check that keeps the copy honest.
  it("matches the chrome colour the browser is told about", () => {
    expect({ light: light()["--c-canvas"], dark: attrDark()["--c-canvas"] }).toEqual({
      light: CHROME_COLOUR.light,
      dark: CHROME_COLOUR.dark,
    });
  });

  // The one colour with a rule attached to it rather than a threshold: it is
  // reserved for grounds that are dark in BOTH themes, because it cannot pass
  // on a white card.
  it("keeps accent-glow off any light ground", () => {
    const palette = light();
    expect(
      contrast(palette["--c-accent-glow"] as string, palette["--c-surface"] as string),
    ).toBeLessThan(3);
    expect(
      contrast(palette["--c-accent-glow"] as string, palette["--c-emphasis"] as string),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
