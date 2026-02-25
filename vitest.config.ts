import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Convex components expose source entrypoints under this export condition,
    // avoiding a dist build requirement for tests.
    conditions: ["@convex-dev/component-source", "import", "module", "default"],
    alias: {
      "@": path.resolve(__dirname, "apps/web-tanstack/src/app"),
      "~": path.resolve(__dirname, "apps/web-tanstack/src"),
      "@convex-generated-api": path.resolve(__dirname, "convex/_generated/api.js"),
      // Workspace packages publish compiled output under `dist/`, but we don't commit
      // build artifacts. Alias tests to the source entrypoints.
      "@lunchtable/cards": path.resolve(__dirname, "packages/lunchtable-tcg-cards/src/client/index.ts"),
      "@lunchtable/engine": path.resolve(__dirname, "packages/engine/src/index.ts"),
      "@lunchtable/match": path.resolve(__dirname, "packages/lunchtable-tcg-match/src/client/index.ts"),
      "@lunchtable/story": path.resolve(__dirname, "packages/lunchtable-tcg-story/src/client/index.ts"),
      "@lunchtable/guilds": path.resolve(__dirname, "packages/lunchtable-tcg-guilds/src/client/index.ts"),
    },
  },
  test: {
    include: [
      "packages/engine/src/**/*.{test,spec}.{js,ts}",
      "packages/plugin-ltcg/src/**/*.{test,spec}.{js,ts}",
      "packages/lunchtable-tcg-match/src/**/*.{test,spec}.{js,ts}",
      "apps/web-tanstack/src/**/*.{test,spec}.{js,ts}",
      "convex/**/*.test.{js,ts}",
      "api/**/*.test.{js,ts}",
      "*.test.{js,ts}",
    ],
  },
});
