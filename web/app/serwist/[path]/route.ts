import { createSerwistRoute } from "@serwist/turbopack";

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
 */
const serwistRoute = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
});

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = serwistRoute;
