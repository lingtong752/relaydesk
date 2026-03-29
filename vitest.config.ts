import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "packages/shared/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx"
    ]
  }
});
