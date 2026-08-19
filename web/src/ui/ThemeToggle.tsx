"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  CHROME_COLOUR,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  isTheme,
  otherTheme,
  type Theme,
} from "../theme/theme";

/**
 * Switches the theme, and is the only thing in the app that writes the cookie.
 *
 * It does not ask the server. The server's job is to get the FIRST paint right,
 * which it does by rendering `data-theme` from the cookie; after that, flipping
 * an attribute is instant and a round trip would only add latency to something
 * that is already correct on screen. The cookie write is bookkeeping for the
 * next request.
 *
 * That cookie is deliberately not httpOnly, unlike the session. It carries a
 * display preference, there is nothing in it to steal, and this component has
 * to be able to write it.
 */
export function ThemeToggle() {
  const t = useTranslations("theme");
  const [theme, setTheme] = useState<Theme>("light");

  /*
   * Read back what the server already decided, rather than deciding again.
   * Running in an effect keeps the first client render identical to the server's
   * — reading `document` during render would be a hydration mismatch — and the
   * button is only mislabelled for the instant before this runs.
   */
  useEffect(() => {
    const attribute = document.documentElement.dataset["theme"];

    if (isTheme(attribute)) {
      setTheme(attribute);
      return;
    }

    // No cookie was set, so the page is showing whatever the system asked for.
    setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  function switchTheme() {
    const next = otherTheme(theme);

    document.documentElement.dataset["theme"] = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;

    // The browser paints its chrome from this tag, and it does not re-read the
    // stylesheet to notice the theme changed.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", CHROME_COLOUR[next]);

    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={switchTheme}
      aria-label={theme === "dark" ? t("switchToLight") : t("switchToDark")}
      className="grid min-h-11 min-w-11 place-items-center rounded-full border border-line bg-surface text-lg transition hover:bg-canvas"
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
