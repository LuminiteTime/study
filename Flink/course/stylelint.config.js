// Цвета живут только в токенах: так палитру и тёмную тему меняют в одном файле.
export default {
  rules: {
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla"],
    "declaration-no-important": true,
    "max-nesting-depth": 1,
    "selector-max-id": 1,
    "selector-max-compound-selectors": 3,
    "declaration-block-no-duplicate-properties": true,
    "no-duplicate-selectors": true,
    "block-no-empty": true,
    "color-no-invalid-hex": true,
    "unit-no-unknown": true,
    "property-no-unknown": true,
  },
  overrides: [
    { files: ["styles/tokens.css"], rules: { "color-no-hex": null, "function-disallowed-list": null } },
    { files: ["styles/base.css"], rules: { "declaration-no-important": null } },
  ],
};
