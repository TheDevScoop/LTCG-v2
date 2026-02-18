import { describe, expect, it } from "vitest";
import { __soundtrackTestUtils as webUtils } from "./soundtrack";
import { __soundtrackTestUtils as rootUtils } from "../../../api/soundtrack";

describe("soundtrack manifest utilities", () => {
	it("parses playlists and sfx sections", () => {
		const raw = `
[default]
/lunchtable/soundtrack/THEME.mp3

[play]
/lunchtable/soundtrack/FREAK.mp3

[sfx]
attack=/api/soundtrack-sfx?name=attack
`;
		const parsed = webUtils.parseSoundtrackIn(raw);
		expect(parsed.playlists.default).toEqual([
			"/lunchtable/soundtrack/THEME.mp3",
		]);
		expect(parsed.playlists.play).toEqual([
			"/lunchtable/soundtrack/FREAK.mp3",
		]);
		expect(parsed.sfx.attack).toBe("/api/soundtrack-sfx?name=attack");
	});

	it("maps legacy sfx tracks to canonical soundtrack-sfx endpoints", () => {
		expect(
			webUtils.normalizeSoundEffectPath(
				"theme2",
				"/lunchtable/soundtrack/THEME2.mp3",
			),
		).toBe("/api/soundtrack-sfx?name=turn");
		expect(
			rootUtils.normalizeSoundEffectPath(
				"victory",
				"/lunchtable/soundtrack/THEMEREMIX.mp3",
			),
		).toBe("/api/soundtrack-sfx?name=victory");
	});

	it("classifies blob tracks and builds non-empty playlists", () => {
		const tracks = [
			{
				pathname: "lunchtable/lunchtable/soundtrack/THEME.mp3",
				url: "https://blob.example/THEME.mp3",
			},
			{
				pathname: "lunchtable/lunchtable/soundtrack/FREAK.mp3",
				url: "https://blob.example/FREAK.mp3",
			},
		];
		const playlists = webUtils.playlistsFromTrackBlobs(tracks);
		expect(playlists?.default).toContain("https://blob.example/THEME.mp3");
		expect(playlists?.landing.length).toBeGreaterThan(0);
		expect(playlists?.play.length).toBeGreaterThan(0);
	});

	it("resolves context fallback ordering", () => {
		const resolved = rootUtils.resolveContext(
			{
				default: ["d1"],
				play: ["p1"],
			},
			"play",
		);
		expect(resolved.key).toBe("play");
		expect(resolved.tracks).toEqual(["p1"]);

		const fallback = rootUtils.resolveContext(
			{
				default: ["d1"],
			},
			"unknown",
		);
		expect(fallback.key).toBe("default");
		expect(fallback.tracks).toEqual(["d1"]);
	});
});
