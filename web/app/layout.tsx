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
        <SerwistProvider swUrl="/serwist/sw.js">
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
