import globals from "globals";
import pluginJs from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";

export default [
  {
    ignores: ["extension/lib/**"]
  },
  pluginJs.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions
      }
    }
  },
  {
    files: ["e2e/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest
      }
    }
  },
  {
    files: ["utils/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    plugins: {
      "@stylistic": stylistic
    },
    rules: {
      "@stylistic/quotes": ["error", "double", { "avoidEscape": true }],
      "@stylistic/semi": ["error", "always"],
      "@stylistic/no-trailing-spaces": "error",
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "block-like" },
        { blankLine: "always", prev: "block-like", next: "*" },
        { blankLine: "always", prev: "*", next: "multiline-expression" },
        { blankLine: "always", prev: "multiline-expression", next: "*" },
        { blankLine: "always", prev: "*", next: "multiline-const" },
        { blankLine: "always", prev: "multiline-const", next: "*" },
        { blankLine: "always", prev: "*", next: "multiline-let" },
        { blankLine: "always", prev: "multiline-let", next: "*" },
        { blankLine: "always", prev: "*", next: "multiline-var" },
        { blankLine: "always", prev: "multiline-var", next: "*" }
      ],
      "@stylistic/lines-around-comment": [
        "error",
        {
          beforeLineComment: true,
          allowBlockStart: true,
          allowObjectStart: true,
          allowArrayStart: true,
          allowClassStart: true
        }
      ]
    }
  }
];
