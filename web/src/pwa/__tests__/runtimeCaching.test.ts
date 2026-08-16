/**
 * @jest-environment node
 */
import type { RouteMatchCallbackOptions, RuntimeCaching } from "serwist";

/**
 * `@serwist/turbopack/worker` picks its `defaultCache` at module-eval time:
 * anything other than `NODE_ENV=production` gets a single `NetworkOnly`
 * catch-all, so importing it the ordinary way under Jest would assert against a
 * list the browser never sees. `isolateModulesAsync` gives the import a fresh
 * registry so the production branch is the one that runs, whatever another
 * suite in this worker already loaded.
 *
 * Everything else is loaded from inside that same registry on purpose. An
 * isolated registry hands out its own copy of `serwist`, so a `NetworkOnly`
 * imported at the top of this file would not be `instanceof` the `NetworkOnly`
 * the isolated `defaultCache` was built from.
 */
const loadProductionPwaModules = async () => {
  jest.replaceProperty(process.env, "NODE_ENV", "production");

  let modules!: {
    defaultCache: RuntimeCaching[];
    withoutApiCaching: (runtimeCaching: readonly RuntimeCaching[]) => RuntimeCaching[];
    NetworkFirst: unknown;
    NetworkOnly: unknown;
  };

  await jest.isolateModulesAsync(async () => {
    const [worker, serwist, runtimeCaching] = await Promise.all([
      import("@serwist/turbopack/worker"),
      import("serwist"),
      import("../runtimeCaching"),
    ]);

    modules = {
      defaultCache: worker.defaultCache,
      withoutApiCaching: runtimeCaching.withoutApiCaching,
      NetworkFirst: serwist.NetworkFirst,
      NetworkOnly: serwist.NetworkOnly,
    };
  });

  return modules;
};

/**
 * Serwist's own matching lives in `Route`, which needs a service-worker global
 * scope. This reproduces the part that decides *which* rule wins: walk the list
 * in registration order and stop at the first matcher that accepts, exactly as
 * `Serwist.findMatchingRoute` does.
 */
const handlerFor = (runtimeCaching: readonly RuntimeCaching[], path: string): unknown => {
  const url = new URL(path, "https://wellness.test");
  const options: RouteMatchCallbackOptions = {
    url,
    request: new Request(url),
    sameOrigin: true,
    event: new Event("fetch") as unknown as ExtendableEvent,
  };

  return runtimeCaching.find(({ matcher }) => {
    if (typeof matcher === "function") return Boolean(matcher(options));
    if (matcher instanceof RegExp) return matcher.test(url.href);
    return url.pathname === matcher;
  })?.handler;
};

describe("withoutApiCaching", () => {
  // `jest.replaceProperty` above is only undone by an explicit restore, and
  // doing it here rather than inline means a failing expectation cannot leak a
  // production NODE_ENV into whatever this worker runs next.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("stops /api/me being written to Cache Storage, which defaultCache alone does not", async () => {
    const { defaultCache, withoutApiCaching, NetworkFirst, NetworkOnly } =
      await loadProductionPwaModules();

    // The defect this exists to prevent: Serwist's own list caches the
    // response, which for /api/me is the user's email and family role.
    expect(handlerFor(defaultCache, "/api/me")).toBeInstanceOf(NetworkFirst as never);

    expect(handlerFor(withoutApiCaching(defaultCache), "/api/me")).toBeInstanceOf(
      NetworkOnly as never,
    );
  });

  it("covers the whole API surface, not just the routes slice 1 happens to call", async () => {
    const { defaultCache, withoutApiCaching, NetworkOnly } = await loadProductionPwaModules();
    const runtimeCaching = withoutApiCaching(defaultCache);

    for (const path of [
      "/api/me",
      "/api/auth/verify",
      "/api/consent",
      "/api/anything/nested?q=1",
    ]) {
      expect(handlerFor(runtimeCaching, path)).toBeInstanceOf(NetworkOnly as never);
    }
  });

  it("leaves non-API requests on the strategies defaultCache chose for them", async () => {
    const { defaultCache, withoutApiCaching } = await loadProductionPwaModules();
    const runtimeCaching = withoutApiCaching(defaultCache);

    for (const path of [
      "/home",
      "/signin",
      "/_next/static/chunks/main.js",
      "/manifest.webmanifest",
    ]) {
      expect(handlerFor(runtimeCaching, path)).toBe(handlerFor(defaultCache, path));
    }
  });

  it("passes the rest of defaultCache through by reference, so upstream changes are not frozen out", async () => {
    const { defaultCache, withoutApiCaching } = await loadProductionPwaModules();

    expect(withoutApiCaching(defaultCache).slice(1)).toEqual(defaultCache);
  });
});
