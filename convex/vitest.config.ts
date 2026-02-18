import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		// Convex components expose source entrypoints under this export condition,
		// avoiding a dist build requirement for tests.
		conditions: ["@convex-dev/component-source", "import", "module", "default"],
	},
	ssr: {
		resolve: {
			conditions: ["@convex-dev/component-source", "import", "module", "default"],
		},
	},
	test: {
		include: ["convex/**/*.test.ts"],
	},
});
