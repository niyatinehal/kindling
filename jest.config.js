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
      // Both integration files truncate every Domain A table in a global
      // beforeAll, so two workers running concurrently delete each other's
      // fixtures. Pinning this project to one worker serializes the files
      // within `test:integration` and within `test:all` (which runs the
      // `unit` and `integration` projects together) without slowing down
      // `npm test`, which only ever selects the `unit` project.
      maxWorkers: 1,
    },
  ],
};
