import type { VercelRequest } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	resetUploadRateLimiterForTest,
	validateBlobUploadRequest,
} from "./uploadSecurity";

function mockRequest(headers: Record<string, string>): VercelRequest {
	return { headers } as unknown as VercelRequest;
}

describe("validateBlobUploadRequest", () => {
	const originalToken = process.env.BLOB_UPLOAD_TOKEN;
	const originalMaxBytes = process.env.BLOB_UPLOAD_MAX_BYTES;
	const originalRateLimit = process.env.BLOB_UPLOAD_RATE_LIMIT_PER_MINUTE;

	beforeEach(() => {
		process.env.BLOB_UPLOAD_TOKEN = "test_token";
		process.env.BLOB_UPLOAD_MAX_BYTES = "1000";
		process.env.BLOB_UPLOAD_RATE_LIMIT_PER_MINUTE = "5";
		resetUploadRateLimiterForTest();
	});

	afterEach(() => {
		process.env.BLOB_UPLOAD_TOKEN = originalToken;
		process.env.BLOB_UPLOAD_MAX_BYTES = originalMaxBytes;
		process.env.BLOB_UPLOAD_RATE_LIMIT_PER_MINUTE = originalRateLimit;
		resetUploadRateLimiterForTest();
	});

	it("rejects requests without a matching bearer token", () => {
		const result = validateBlobUploadRequest(
			mockRequest({
				"content-length": "10",
				"content-type": "image/png",
			}),
			"card.png",
		);

		expect(result).toEqual({
			ok: false,
			status: 401,
			error: "Unauthorized",
		});
	});

	it("accepts valid requests and sanitizes filename path segments", () => {
		const result = validateBlobUploadRequest(
			mockRequest({
				authorization: "Bearer test_token",
				"content-length": "10",
				"content-type": "image/png",
				"x-forwarded-for": "1.2.3.4",
			}),
			"../unsafe/card.png",
		);

		expect(result).toEqual({
			ok: true,
			filename: "card.png",
		});
	});

	it("rejects unsupported extensions", () => {
		const result = validateBlobUploadRequest(
			mockRequest({
				authorization: "Bearer test_token",
				"content-length": "10",
				"content-type": "image/png",
				"x-forwarded-for": "5.6.7.8",
			}),
			"card.txt",
		);

		expect(result).toEqual({
			ok: false,
			status: 400,
			error: "Invalid file type. Allowed: jpg, png, webp, gif, svg",
		});
	});

	it("rejects missing content length", () => {
		const result = validateBlobUploadRequest(
			mockRequest({
				authorization: "Bearer test_token",
				"content-type": "image/png",
			}),
			"card.png",
		);

		expect(result).toEqual({
			ok: false,
			status: 411,
			error: "Content-Length header is required",
		});
	});

	it("rejects payloads exceeding configured max size", () => {
		process.env.BLOB_UPLOAD_MAX_BYTES = "9";
		const result = validateBlobUploadRequest(
			mockRequest({
				authorization: "Bearer test_token",
				"content-length": "10",
				"content-type": "image/png",
			}),
			"card.png",
		);

		expect(result).toEqual({
			ok: false,
			status: 413,
			error: "Upload exceeds maximum allowed size",
		});
	});

	it("rejects content-type and extension mismatches", () => {
		const result = validateBlobUploadRequest(
			mockRequest({
				authorization: "Bearer test_token",
				"content-length": "10",
				"content-type": "image/jpeg",
			}),
			"card.png",
		);

		expect(result).toEqual({
			ok: false,
			status: 415,
			error: "Unsupported media type for file extension",
		});
	});

	it("enforces per-client rate limits", () => {
		process.env.BLOB_UPLOAD_RATE_LIMIT_PER_MINUTE = "1";

		const request = mockRequest({
			authorization: "Bearer test_token",
			"content-length": "10",
			"content-type": "image/png",
			"x-forwarded-for": "10.0.0.1",
		});

		const first = validateBlobUploadRequest(request, "card.png");
		const second = validateBlobUploadRequest(request, "card.png");

		expect(first).toEqual({
			ok: true,
			filename: "card.png",
		});
		expect(second).toEqual({
			ok: false,
			status: 429,
			error: "Rate limit exceeded",
		});
	});
});
