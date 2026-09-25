// @ts-check
import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["dist/**", "node_modules/**", "coverage/**"]),

  {
    files: ["**/*.ts"],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
