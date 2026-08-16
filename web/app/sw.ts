import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

import { withoutApiCaching } from "../src/pwa/runtimeCaching";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  // `__SW_MANIFEST` is typed as possibly-undefined, but `SerwistOptions` declares
  // `precacheEntries?:` without `| undefined` — and this tsconfig sets
  // `exactOptionalPropertyTypes`, so passing the bare value is TS2379. Serwist's
  // own guard is `!!precacheEntries && precacheEntries.length > 0`, so an empty
  // array is precisely as inert as the undefined it replaces.
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: withoutApiCaching(defaultCache),
  // `PrecacheFallbackPlugin` resolves these through `matchPrecache()`, which
  // only ever looks in the precache — a copy of /~offline left in a runtime
  // cache by an earlier visit is invisible to it. Turbopack's glob set is
  // `.next/static/**/*` plus `public/**/*`, and App Router pages are never
  // emitted into `.next/static`, so nothing put /~offline there: the entry is
  // added explicitly via `additionalPrecacheEntries` in
  // `app/serwist/[path]/route.ts`. Remove that and this fallback goes back to
  // being unreachable rather than merely unused.
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
