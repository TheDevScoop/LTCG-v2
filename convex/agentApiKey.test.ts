import { describe, expect, it } from "vitest";
import { buildApiKeyPrefix, isSupportedAgentApiKey } from "./agentApiKey";

describe("agent api key helpers", () => {
	it("accepts supported api key prefixes", () => {
		expect(isSupportedAgentApiKey("ltcg_abcdef")).toBe(true);
		expect(isSupportedAgentApiKey("rpg_abcdef")).toBe(true);
		expect(isSupportedAgentApiKey("foo_abcdef")).toBe(false);
	});

	it("builds a masked prefix", () => {
		expect(buildApiKeyPrefix("rpg_1234567890abcdef")).toBe("rpg_12345678...");
		expect(buildApiKeyPrefix("ltcg_abcdef1234567890")).toBe("ltcg_abcdef12...");
	});
});
