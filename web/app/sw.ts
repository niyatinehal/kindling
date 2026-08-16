import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

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
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
