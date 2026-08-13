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
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  clearMocks: true,
};
