import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const common = { clearMocks: true };

// `next-intl` and the ESM-only ICU packages it pulls in (`use-intl`,
// `@formatjs/*`, `@schummar/icu-type-parser`, `icu-minify`,
// `intl-messageformat`) have no CommonJS build. `next/jest`'s own
// `transformIgnorePatterns` only ever transpiles `geist` out of
// node_modules, and since transformIgnorePatterns entries are OR'd for
// exclusion, appending a permissive pattern through the config passed
// into `createJestConfig` can't undo that default — it only adds more
// exclusions. So the restrictive pattern nextJest computes is replaced
// outright, for tests only; this does not touch the production build.
const transformIgnorePatterns = [
  "/node_modules/(?!(next-intl|use-intl|@formatjs|@schummar|icu-minify|intl-messageformat)/)",
];

export default async function config() {
  const jsdom = await createJestConfig({
    ...common,
    displayName: "components",
    testEnvironment: "jsdom",
    setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
    testMatch: ["<rootDir>/src/**/*.test.tsx"],
  })();
  jsdom.transformIgnorePatterns = transformIgnorePatterns;

  const node = await createJestConfig({
    ...common,
    displayName: "route-handlers",
    testEnvironment: "node",
    testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/app/**/*.test.ts"],
  })();
  node.transformIgnorePatterns = transformIgnorePatterns;

  return { projects: [jsdom, node] };
}
