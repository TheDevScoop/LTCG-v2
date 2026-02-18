import { describe, expect, it } from "vitest";
import {
	buildToneBuffer,
	resolveTrackFrequency,
	TRACK_FREQUENCY_HZ,
} from "./soundtrackSfx";

describe("soundtrack sfx helper", () => {
	it("maps known names and defaults unknown names", () => {
		expect(resolveTrackFrequency(" summon ")).toBe(TRACK_FREQUENCY_HZ.summon);
		expect(resolveTrackFrequency("missing")).toBe(220);
		expect(resolveTrackFrequency(undefined)).toBe(220);
	});

	it("builds a deterministic WAV header", () => {
		const wav = buildToneBuffer(440);

		expect(wav.length).toBeGreaterThan(44);
		expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
		expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
		expect(wav.subarray(12, 16).toString("ascii")).toBe("fmt ");
		expect(wav.subarray(36, 40).toString("ascii")).toBe("data");
	});
});
