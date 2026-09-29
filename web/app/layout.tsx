import "./globals.css";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import {
  CHROME_COLOUR,
  DEFAULT_THEME,
  THEME_COOKIE,
  isTheme,
  type Theme,
} from "../src/theme/theme";

/*
 * Self-hosted by next/font at build time, so no request ever goes to Google
 * from a visitor's browser — the privacy page promises no third parties, and
 * a font CDN would quietly be one. `swap` shows the system face until these
 * arrive rather than blank text, which matters on a slow phone connection.
 */
const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "Family Wellness Platform",
  description: "One app a whole family opens.",
  manifest: "/manifest.webmanifest",
  // The manifest covers Android and desktop. iOS reads none of it: Safari takes
  // the home-screen icon from `apple-touch-icon` and standalone display from
  // the meta tag `appleWebApp` emits, so without these an install on an iPhone
  // gets a screenshot of the page for an icon and opens in a browser tab.
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    title: "Wellness",
    // `default` keeps the status bar legible against `--color-canvas`.
    // `black-translucent` would draw the page under the clock and battery.
    statusBarStyle: "default",
  },
};

/**
 * The explicit choice, if one has been made. `undefined` means nobody has
 * chosen and the system preference should decide — which CSS handles on its
 * own, so the attribute is left off entirely rather than guessed at here.
 */
async function storedTheme(): Promise<Theme | undefined> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : undefined;
}

/**
 * Browser chrome follows the theme: the stored choice, or the default when
 * nobody has made one. Always one colour — the page no longer follows the
 * system preference, so neither may the address bar.
 */
export async function generateViewport(): Promise<Viewport> {
  const theme = await storedTheme();

  return { themeColor: CHROME_COLOUR[theme ?? DEFAULT_THEME] };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const theme = await storedTheme();

  return (
    /*
      `data-theme` is rendered here, on the server, from the cookie — so the
      correct palette is in the first byte of HTML. That is what makes the
      flash of the wrong theme impossible rather than merely unlikely: there is
      no moment where the document exists with the other theme applied, and no
      script racing the first paint to correct it.

      Absent a cookie the attribute is omitted, and `globals.css` falls through
      to the dark palette, which is the default.
    */
    <html
      lang={locale}
      className={body.variable}
      {...(theme !== undefined && { "data-theme": theme })}
    >
      <body className="font-sans">
        {/*
          The worker is served from /serwist/sw.js, so its *default* scope would
          be /serwist/ — it would control nothing the user ever visits. Two
          things widen it to the origin root: the route handler answers with
          `Service-Worker-Allowed: /`, and SerwistProvider registers with
          `scope: "/"` (its default when no `options.scope` is given).
        */}
        {/*
          `reloadOnOnline` defaults to true, which calls `location.reload()` on
          the window `online` event. Sign-in keeps the contact, the code and
          "a code was sent" in React state, so a Wi-Fi-to-cellular handoff or a
          two-second drop mid-OTP would wipe the code being typed and the fact
          that one had been requested. A reload buys nothing here — the pages
          fetch what they need on mount — so it is off.
        */}
        <SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false}>
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
