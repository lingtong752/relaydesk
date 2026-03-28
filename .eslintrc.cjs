module.exports = {
  root: true,
  env: {
    es2022: true,
    browser: true,
    node: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true
    }
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: ["dist", "node_modules", "coverage", "*.config.js", "*.config.ts"],
  overrides: [
    {
      files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
      env: {
        browser: true,
        node: false
      }
    },
    {
      files: ["apps/api/**/*.ts"],
      env: {
        browser: false,
        node: true
      }
    }
  ]
};
