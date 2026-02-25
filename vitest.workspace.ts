import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
	"api/vitest.config.ts",
	"convex/vitest.config.ts",
	"packages/engine/vitest.config.ts",
	"packages/lunchtable-tcg-card-studio-sdk/vitest.config.ts",
]);
