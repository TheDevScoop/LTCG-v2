import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
	"convex/vitest.config.ts",
	"packages/engine/vitest.config.ts",
	"packages/lunchtable-tcg-card-studio-sdk/vitest.config.ts",
	"apps/web/vitest.config.ts",
	"apps/card-studio/vitest.config.ts",
]);
