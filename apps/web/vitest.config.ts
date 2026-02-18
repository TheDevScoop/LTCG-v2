import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		include: ["src/**/*.{test,spec}.{js,ts}", "api/**/*.{test,spec}.{js,ts}"],
	},
});
