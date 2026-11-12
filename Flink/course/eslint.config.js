import js from "@eslint/js";
import globals from "globals";

// Лимиты держат файлы и функции маленькими: их читают люди и модель с ограниченным контекстом.
export default [
  js.configs.recommended,
  {
    files: ["scripts/**/*.js", "viz/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.browser, Course: "readonly", d3: "readonly", gsap: "readonly", MotionPathPlugin: "readonly" } },
    rules: {
      complexity: ["error", 10],
      "max-depth": ["error", 3],
      "max-params": ["error", 4],
      "max-nested-callbacks": ["error", 3],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 40, skipBlankLines: true, skipComments: true, IIFEs: false }],
      "max-statements": ["error", 20],
      "max-len": ["error", { code: 140, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreUrls: true }],
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
