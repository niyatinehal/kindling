import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  { ignores: [".next/**", "next-env.d.ts"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  prettierConfig,
);
