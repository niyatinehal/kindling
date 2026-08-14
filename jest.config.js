/**
 * Jest runs the TypeScript sources through ts-jest in ESM mode, because the
 * package is `"type": "module"`. That requires three things to line up:
 *   1. `useESM` + `extensionsToTreatAsEsm` so ts-jest emits ESM, not CJS.
 *   2. `moduleNameMapper` to strip the `.js` extension that Node ESM requires
 *      on relative imports but which resolves to a `.ts` file on disk.
 *   3. `NODE_OPTIONS=--experimental-vm-modules` in the `test` script.
 *
 * @type {import('jest').Config}
 */
const common = {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  clearMocks: true,
};

export default {
  projects: [
    {
      ...common,
      displayName: "unit",
      testMatch: ["<rootDir>/test/**/*.test.ts"],
      testPathIgnorePatterns: ["<rootDir>/test/integration/"],
    },
    {
      ...common,
      displayName: "integration",
      testMatch: ["<rootDir>/test/integration/**/*.test.ts"],
      testTimeout: 30000,
      // NOTE: `maxWorkers` does NOT work here. Jest treats it as a top-level
      // option and silently ignores it inside a `projects` entry — verified by
      // observing 4/11 integration tests pass without `--runInBand` and 10/11
      // with it, on identical code. Serialization is therefore enforced by
      // `--runInBand` on the `test:integration` and `test:all` scripts instead.
      // It is genuinely needed: both integration files truncate every Domain A
      // table in a global `beforeAll`, so concurrent workers delete each
      // other's fixtures. `npm test` selects only the `unit` project and stays
      // parallel.
    },
  ],
};
