import { withSerwist } from "@serwist/turbopack";
import createNextIntlPlugin from "next-intl/plugin";

import { SECURITY_HEADERS } from "./src/security/securityHeaders.mjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Applied here rather than in the proxy so they cover everything the origin
  // serves, including the static assets and the service worker the proxy's
  // matcher deliberately skips.
  headers: () => [{ source: "/:path*", headers: SECURITY_HEADERS }],
};

export default withSerwist(withNextIntl(nextConfig));
