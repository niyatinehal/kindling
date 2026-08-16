import { NetworkOnly, type RuntimeCaching } from "serwist";

/**
 * Takes Serwist's runtime-caching list and returns one that can never write a
 * response from our own API into Cache Storage.
 *
 * `defaultCache` runs a `NetworkFirst` over every same-origin GET under `/api/`
 * — only `/api/auth/*` is carved out ahead of it — and that strategy copies the
 * response body into `caches.open("apis")`. `/api/me` returns the signed-in
 * user's `id`, `display_name`, `locale`, `email` and `family: { id, role }`, and
 * the sign-in page fetches it from the browser the moment a code is verified,
 * so every sign-in populated that cache. `Cache-Control: private, no-store` does
 * not help: the Cache API stores whatever it is handed. Identity material then
 * sits in plaintext, readable by any script on the origin, for 24h past last
 * use — which is precisely what the httpOnly session cookie exists to prevent.
 *
 * There is a second, quieter failure: `NetworkFirst` serves the cached copy
 * whenever the network is down or slower than its 10s timeout. On a shared
 * family device that means the next person to open the app can be routed by the
 * previous person's `/api/me`.
 *
 * The fix is a `NetworkOnly` rule in front of the list rather than a surgical
 * edit of the offending entry. Serwist registers routes by pushing them onto a
 * per-method array and `findMatchingRoute` returns the first match, so a
 * leading `/api/` rule makes every later `/api/` rule unreachable — the one in
 * `defaultCache` today and any that a future version of `defaultCache` adds.
 * The rest of the list is spread through untouched, so upstream changes to the
 * font, image and page rules still reach us instead of being frozen at whatever
 * we copied.
 *
 * Nothing is given up at slice 1: there is no offline-data feature to lose.
 */
export const withoutApiCaching = (runtimeCaching: readonly RuntimeCaching[]): RuntimeCaching[] => [
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"),
    handler: new NetworkOnly(),
  },
  ...runtimeCaching,
];
