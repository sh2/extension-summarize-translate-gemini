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
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "block-like" },
        { blankLine: "always", prev: "block-like", next: "*" }
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
