import { describe, expect, it } from "vitest";
import {
	isPlainObject,
	normalizeGameCommand,
	parseLegacyResponseType,
} from "./agentRouteHelpers";

describe("agent route helpers", () => {
	it("detects plain objects only", () => {
		expect(isPlainObject({ a: 1 })).toBe(true);
		expect(isPlainObject(null)).toBe(false);
		expect(isPlainObject([])).toBe(false);
		expect(isPlainObject("x")).toBe(false);
	});

	it("parses legacy response strings into pass booleans", () => {
		expect(parseLegacyResponseType("pass")).toBe(true);
		expect(parseLegacyResponseType("continue")).toBe(false);
		expect(parseLegacyResponseType("play")).toBe(false);
		expect(parseLegacyResponseType("no")).toBe(false);
		expect(parseLegacyResponseType("invalid")).toBeUndefined();
	});

	it("normalizes legacy command field names", () => {
		const normalized = normalizeGameCommand({
			type: "ATTACK",
			attackerInstanceId: "a1",
			targetInstanceId: "t1",
			newPosition: "DEFENSE",
		}) as Record<string, unknown>;

		expect(normalized.attackerId).toBe("a1");
		expect(normalized.targetId).toBe("t1");
		expect(normalized.position).toBe("DEFENSE");
		expect(normalized.attackerInstanceId).toBeUndefined();
		expect(normalized.targetInstanceId).toBeUndefined();
		expect(normalized.newPosition).toBeUndefined();
	});

	it("converts CHAIN_RESPONSE responseType into pass when applicable", () => {
		const normalized = normalizeGameCommand({
			type: "CHAIN_RESPONSE",
			responseType: "pass",
		}) as Record<string, unknown>;

		expect(normalized.pass).toBe(true);
		expect(normalized.responseType).toBeUndefined();
	});

	it("preserves explicit pass values on CHAIN_RESPONSE", () => {
		const normalized = normalizeGameCommand({
			type: "CHAIN_RESPONSE",
			pass: false,
			responseType: "pass",
		}) as Record<string, unknown>;

		expect(normalized.pass).toBe(false);
		expect(normalized.responseType).toBe("pass");
	});
});
