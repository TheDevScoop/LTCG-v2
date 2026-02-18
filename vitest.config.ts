import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
      "@convex-generated-api": path.resolve(__dirname, "convex/_generated/api.js"),
    },
  },
  test: {
    include: [
      "packages/engine/src/**/*.{test,spec}.{js,ts}",
      "apps/web/src/**/*.{test,spec}.{js,ts}",
      "convex/**/*.test.{js,ts}",
      "api/**/*.test.{js,ts}",
      "*.test.{js,ts}",
    ],
  },
});
