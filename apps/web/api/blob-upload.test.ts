import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import handler, { config } from "./blob-upload";

describe("blob-upload API handler", () => {
	it("exposes bodyParser=false config", () => {
		expect(config.api.bodyParser).toBe(false);
	});

	it("returns 405 for non-POST requests", async () => {
		const json = vi.fn();
		const status = vi.fn(() => ({ json }));
		const req = { method: "GET" } as unknown as VercelRequest;
		const res = { status } as unknown as VercelResponse;

		await handler(req, res);

		expect(status).toHaveBeenCalledWith(405);
		expect(json).toHaveBeenCalledWith({ error: "Method not allowed" });
	});
});
