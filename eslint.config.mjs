import { defineConfig } from "eslint/config";
import globals from "eslint";
import tseslint from "typescript-eslint";

export default defineConfig([
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
    },
    react.configs.flat.recommended,
    {
        plugins: {},
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    vars: "all",
                    args: "none",
                    varsIgnorePattern: "^_",
                    argsIgnorePattern: "^_",
                    caughtErrors: "none",
                    ignoreRestSiblings: true,
                    ignoreUsingDeclarations: false,
                    reportUsedIgnorePattern: false,
                },
            ],
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-explicit-any": [
                "warn",
                {
                    ignoreRestArgs: true,
                },
            ],
            "@typescript-eslint/switch-exhaustiveness-check": [
                "warn",
                {
                    considerDefaultExhaustiveForUnions: true,
                },
            ],
        },
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
    },
]);
