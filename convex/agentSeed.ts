export const buildDeterministicSeed = (seedInput: string): number => {
	let hash = 2166136261;
	for (let i = 0; i < seedInput.length; i++) {
		hash ^= seedInput.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
};

export const makeRng = (seed: number) => {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

export const buildMatchSeed = (
	parts: Array<string | number | null | undefined>,
): number => {
	const values = parts.map((value) => String(value ?? "")).join("|");
	return buildDeterministicSeed(values);
};
