import { defineProject } from "vitest/config";

export default defineWorkspace([
  "convex/vitest.config.ts",
  "packages/engine/vitest.config.ts",
  "apps/web/vitest.config.ts",
]);
