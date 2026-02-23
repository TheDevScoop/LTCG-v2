import { describe, expect, it } from "vitest";
import { buildDeckFingerprint, buildDeterministicSeed, buildMatchSeed, makeRng } from "./agentSeed";

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

	it("builds stable deck fingerprints preserving deck order", () => {
		const deck = ["c1", "c2", "c3"];
		const same = ["c1", "c2", "c3"];
		const reordered = ["c2", "c1", "c3"];
		expect(buildDeckFingerprint(deck)).toBe(buildDeckFingerprint(same));
		expect(buildDeckFingerprint(deck)).not.toBe(buildDeckFingerprint(reordered));
	});

	it("avoids first-card/length seed collisions by using full deck fingerprints", () => {
		const hostA = ["alpha", "x", "y", "z"];
		const hostB = ["alpha", "x", "q", "z"];
		const away = ["beta", "k", "l", "m"];

		const seedA = buildMatchSeed([
			"pvpLobbyJoin",
			"mode:pvp",
			"user_host",
			"user_away",
			`hostDeck:${buildDeckFingerprint(hostA)}`,
			`awayDeck:${buildDeckFingerprint(away)}`,
		]);
		const seedB = buildMatchSeed([
			"pvpLobbyJoin",
			"mode:pvp",
			"user_host",
			"user_away",
			`hostDeck:${buildDeckFingerprint(hostB)}`,
			`awayDeck:${buildDeckFingerprint(away)}`,
		]);

		expect(seedA).not.toBe(seedB);
	});
});
