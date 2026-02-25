import { timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "./vercelTypes";

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

const ALLOWED_EXTENSIONS = new Set([
	".jpg",
	".jpeg",
	".png",
	".webp",
	".gif",
	".svg",
]);
const CONTENT_TYPE_BY_EXT: Record<string, RegExp> = {
	".jpg": /^image\/jpeg$/i,
	".jpeg": /^image\/jpeg$/i,
	".png": /^image\/png$/i,
	".webp": /^image\/webp$/i,
	".gif": /^image\/gif$/i,
	".svg": /^image\/svg\+xml$/i,
};

const rateBucket = new Map<string, { count: number; resetAt: number }>();

function maxUploadBytes(): number {
	const raw = Number(
		process.env.BLOB_UPLOAD_MAX_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES,
	);
	return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_UPLOAD_BYTES;
}

function maxRequestsPerMinute(): number {
	const raw = Number(
		process.env.BLOB_UPLOAD_RATE_LIMIT_PER_MINUTE ?? DEFAULT_RATE_LIMIT,
	);
	return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RATE_LIMIT;
}

function getClientId(request: VercelRequest): string {
	const forwarded = request.headers["x-forwarded-for"];
	if (typeof forwarded === "string" && forwarded.trim()) {
		return forwarded.split(",")[0]?.trim() ?? "unknown";
	}

	if (Array.isArray(forwarded) && forwarded[0]) {
		return forwarded[0];
	}

	const realIp = request.headers["x-real-ip"];
	if (typeof realIp === "string" && realIp.trim()) {
		return realIp;
	}

	return "unknown";
}

function rateLimitOk(request: VercelRequest): boolean {
	const clientId = getClientId(request);
	const now = Date.now();
	const limit = maxRequestsPerMinute();

	const current = rateBucket.get(clientId);
	if (!current || current.resetAt <= now) {
		rateBucket.set(clientId, { count: 1, resetAt: now + RATE_WINDOW_MS });
		return true;
	}

	if (current.count >= limit) {
		return false;
	}

	current.count += 1;
	rateBucket.set(clientId, current);
	return true;
}

function parseContentLength(request: VercelRequest): number | null {
	const header = request.headers["content-length"];
	const value = Array.isArray(header) ? header[0] : header;
	if (!value) return null;

	const length = Number(value);
	if (!Number.isFinite(length) || length <= 0) return null;
	return length;
}

function extensionOf(filename: string): string {
	const index = filename.lastIndexOf(".");
	if (index < 0) return "";
	return filename.slice(index).toLowerCase();
}

function safeBaseName(filename: string): string {
	const trimmed = filename.trim();
	const unix = trimmed.split("/").pop() ?? trimmed;
	const win = unix.split("\\").pop() ?? unix;
	return win;
}

function validFileName(name: string): boolean {
	return /^[a-zA-Z0-9._-]{1,120}$/.test(name);
}

function tokenMatches(actual: string, expected: string): boolean {
	const a = Buffer.from(actual);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

function authOk(request: VercelRequest): boolean {
	const expectedToken = process.env.BLOB_UPLOAD_TOKEN;
	if (!expectedToken) {
		return false;
	}

	const authHeader = request.headers.authorization;
	const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
	if (!auth || !auth.startsWith("Bearer ")) {
		return false;
	}

	return tokenMatches(auth.slice(7), expectedToken);
}

export type UploadValidationResult =
	| { ok: true; filename: string }
	| { ok: false; status: number; error: string };

export function validateBlobUploadRequest(
	request: VercelRequest,
	filenameRaw: unknown,
): UploadValidationResult {
	if (!authOk(request)) {
		return { ok: false, status: 401, error: "Unauthorized" };
	}

	if (!rateLimitOk(request)) {
		return { ok: false, status: 429, error: "Rate limit exceeded" };
	}

	if (!filenameRaw || typeof filenameRaw !== "string") {
		return { ok: false, status: 400, error: "Filename is required" };
	}

	const filename = safeBaseName(filenameRaw);
	if (!validFileName(filename)) {
		return { ok: false, status: 400, error: "Invalid filename" };
	}

	const extension = extensionOf(filename);
	if (!ALLOWED_EXTENSIONS.has(extension)) {
		return {
			ok: false,
			status: 400,
			error: "Invalid file type. Allowed: jpg, png, webp, gif, svg",
		};
	}

	const contentLength = parseContentLength(request);
	if (contentLength === null) {
		return {
			ok: false,
			status: 411,
			error: "Content-Length header is required",
		};
	}

	if (contentLength > maxUploadBytes()) {
		return {
			ok: false,
			status: 413,
			error: "Upload exceeds maximum allowed size",
		};
	}

	const contentTypeHeader = request.headers["content-type"];
	const contentType = Array.isArray(contentTypeHeader)
		? contentTypeHeader[0]
		: contentTypeHeader;

	if (
		!contentType ||
		!CONTENT_TYPE_BY_EXT[extension]?.test(contentType.split(";")[0]?.trim())
	) {
		return {
			ok: false,
			status: 415,
			error: "Unsupported media type for file extension",
		};
	}

	return { ok: true, filename };
}

export function resetUploadRateLimiterForTest(): void {
	rateBucket.clear();
}
