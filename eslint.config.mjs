import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            "**/.output/**",
            "**/.wxt/**",
            "**/coverage/**",
            "**/node_modules/**",
            "**/.recorder/**",
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            globals: { ...globals.browser, ...globals.webextensions },
        },
        rules: {
            "@typescript-eslint/consistent-type-imports": "error",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
    {
        files: ["**/*.mjs", "**/*.js"],
        languageOptions: {
            globals: globals.node,
        },
    },
);
