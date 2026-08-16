import { SerwistProvider } from "@serwist/turbopack/react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";

export const metadata = {
  title: "Family Wellness Platform",
  description: "One app a whole family opens.",
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
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
