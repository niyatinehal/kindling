/**
 * The theme preference — what it is called, what it can be, and what colour the
 * browser chrome should be for each.
 *
 * Pure data, no transport and no DOM, so both the server layout and the client
 * toggle can import it without dragging the other's runtime in behind them.
 */
export const THEME_COOKIE = "theme";

/** A year. The preference is a preference, not a session detail. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export const isTheme = (value: unknown): value is Theme =>
  typeof value === "string" && (THEMES as readonly string[]).includes(value);

/**
 * `--c-canvas` for each theme, duplicated here on purpose.
 *
 * The browser paints its chrome from a `<meta>` tag before any stylesheet is
 * parsed, so this one value cannot be read from CSS at the moment it is needed.
 * `palette.test.ts` asserts these still match `globals.css`, so the copy cannot
 * drift away from the original.
 */
export const CHROME_COLOUR: Record<Theme, string> = {
  light: "#f4f7f2",
  // The same value the Android app's twa-manifest.json already declares as
  // `themeColorDark`, so the status bar above the page matches the page.
  dark: "#0f1a14",
};

/**
 * What a visitor sees before choosing. Dark, deliberately, not the system
 * preference: the design is built dark-first, and most phones report light,
 * so following the system would mean almost nobody saw it. The toggle is on
 * every screen, and a choice made there is kept in THEME_COOKIE.
 */
export const DEFAULT_THEME: Theme = "dark";

export const otherTheme = (theme: Theme): Theme => (theme === "dark" ? "light" : "dark");
