import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/engine/vitest.config.ts",
  "apps/web/vitest.config.ts",
  "convex/vitest.config.ts",
]);
