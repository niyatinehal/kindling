import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    // supabase/.temp/ holds generated runtime state (e.g. edge function
    // bundles) from `supabase start`; it is gitignored and not project source.
    ignores: ["dist/**", "coverage/**", "supabase/.temp/**", "generated/**"],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },

  // The entry point logs its bind address to stdout before any logger exists.
  {
    files: ["src/server.ts", "prisma/seed.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // Config files are plain JS and live outside tsconfig's `include`.
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Must stay last: turns off every rule Prettier already owns.
  prettierConfig,
);
