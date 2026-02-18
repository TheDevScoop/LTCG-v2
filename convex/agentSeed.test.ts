import { describe, expect, it } from "vitest";
import { buildDeterministicSeed, buildMatchSeed, makeRng } from "./agentSeed";

describe("agent seed helpers", () => {
	it("builds deterministic seeds from string input", () => {
		const a = buildDeterministicSeed("abc");
		const b = buildDeterministicSeed("abc");
		const c = buildDeterministicSeed("abcd");
		expect(a).toBe(b);
		expect(a).not.toBe(c);
	});

	it("builds deterministic match seeds from part arrays", () => {
		const a = buildMatchSeed(["agentStartDuel", 1, 2, "deckA"]);
		const b = buildMatchSeed(["agentStartDuel", 1, 2, "deckA"]);
		expect(a).toBe(b);
	});

	it("produces stable RNG sequence for a seed", () => {
		const rngA = makeRng(1234);
		const rngB = makeRng(1234);
		const seqA = [rngA(), rngA(), rngA()];
		const seqB = [rngB(), rngB(), rngB()];
		expect(seqA).toEqual(seqB);
	});
});
