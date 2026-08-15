import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  { ignores: [".next/**", "next-env.d.ts"] },
  js.configs.recommended,
  tseslint.configs.recommended,

  {
    rules: {
      // Allow the conventional leading-underscore name for an intentionally
      // unused binding (e.g. destructuring a property away, as in the env
      // test's `{ API_BASE_URL: _omitted, ...rest }`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // The single most dangerous mistake available in this codebase.
      // createBrowserClient sets the session through document.cookie, which
      // cannot be httpOnly — and everything still appears to work. A test
      // proves the cookie is httpOnly today; this stops it regressing tomorrow.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/ssr",
              importNames: ["createBrowserClient"],
              message:
                "Use createSupabaseServerClient() from src/supabase/server.ts. A cookie written by JavaScript cannot be httpOnly.",
            },
          ],
        },
      ],
    },
  },

  prettierConfig,
);
