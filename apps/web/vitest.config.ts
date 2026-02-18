import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@convex-generated-api": path.resolve(__dirname, "../../convex/_generated/api.js"),
		},
	},
	test: {
		include: ["src/**/*.{test,spec}.{js,ts}", "api/**/*.{test,spec}.{js,ts}"],
	},
});
