import globals from "globals";
import pluginJs from "@eslint/js";

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
    rules: {
      "quotes": ["error", "double", { "avoidEscape": true }],
      "semi": ["error", "always"]
    }
  }
];
