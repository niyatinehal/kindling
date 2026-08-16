import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { createSerwistRoute } from "@serwist/turbopack";

/**
 * The sources that decide what the precached /~offline document contains: the
 * page itself, the root layout that wraps it, and the message catalogues the
 * layout serialises into the HTML. Paths are relative to the working directory
 * of a Next build, which is this workspace root — the same assumption `swSrc`
 * below already makes.
 */
const offlineDocumentSources = [
  "app/~offline/page.tsx",
  "app/layout.tsx",
  "messages/en.json",
  "messages/hi.json",
];

/**
 * `revision: null` is right for the JS chunks Turbopack precaches, because
 * their URLs are content-hashed — a new build gives a new URL, so the entry
 * changes by itself. `/~offline` has no hash in its URL, so `revision: null`
 * there would mean "cached once, never fetched again": the first deploy's
 * offline page would outlive every rewrite of it.
 *
 * So the revision is a digest of the sources that produce the document. Change
 * the copy, the layout or a message catalogue and the digest moves, and Serwist
 * re-fetches /~offline on the next install. Leave them alone and it doesn't,
 * which is the point — an unchanged page should not be re-downloaded.
 *
 * The known gap: a build that changes only Next's build ID moves the script
 * URLs inside the rendered HTML without moving this digest, so the cached copy
 * can reference chunks that no longer exist. That costs the offline page its
 * hydration, not its content — it is static text with no interactivity, and it
 * still renders. The alternative, a per-build value, would re-download it on
 * every deploy and make the build non-deterministic.
 */
const offlineDocumentRevision = offlineDocumentSources
  .reduce((digest, source) => digest.update(readFileSync(source)), createHash("sha256"))
  .digest("hex")
  .slice(0, 32);

/**
 * `useNativeEsbuild: true` is required, not optional.
 *
 * @serwist/turbopack declares BOTH `esbuild` and `esbuild-wasm` as peers and
 * defaults to the wasm one off Windows. The documented install line installs
 * only `esbuild`, leaving the wasm import unresolvable — which surfaces as
 * Serwist issue #360: a RUNTIME `ERR_MODULE_NOT_FOUND` during page-data
 * collection, not a compile error. This flag is the verified one-line fix.
 *
 * `swUrl` is NOT an option here (TS2353) — it belongs on <SerwistProvider>.
 *
 * Every binding the factory returns is re-exported, not just `GET`. The route
 * segment config (`dynamic`/`dynamicParams`/`revalidate`) plus
 * `generateStaticParams` is what makes Next prerender the worker at build
 * time; drop them and the worker is built lazily on first request instead.
 *
 * `additionalPrecacheEntries` is what makes the /~offline fallback in
 * `app/sw.ts` able to serve at all. Turbopack globs `.next/static/**` and
 * `public/**` for the manifest, and App Router pages are rendered into neither,
 * so before this the manifest was 14 JS chunks plus the web manifest and not a
 * single HTML document — and `PrecacheFallbackPlugin` looks the fallback up
 * with `matchPrecache()`, which reads the precache and nothing else. The
 * fallback was declared, reachable by no path, and a `curl /~offline -> 200`
 * could not tell the difference. Verify by reading the manifest out of
 * `.next/server/app/serwist/sw.js.body`, not by fetching the page.
 */
const serwistRoute = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: "/~offline", revision: offlineDocumentRevision }],
});

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = serwistRoute;
