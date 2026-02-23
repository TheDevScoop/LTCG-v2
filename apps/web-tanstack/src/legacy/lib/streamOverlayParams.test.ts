import { describe, expect, it } from "vitest";
import {
  normalizeStreamOverlaySeat,
  parseStreamOverlayParams,
} from "./streamOverlayParams";

describe("normalizeStreamOverlaySeat", () => {
  it("returns null for missing values", () => {
    expect(normalizeStreamOverlaySeat(null)).toBeNull();
    expect(normalizeStreamOverlaySeat("")).toBeNull();
    expect(normalizeStreamOverlaySeat("   ")).toBeNull();
  });

  it("accepts host/away values", () => {
    expect(normalizeStreamOverlaySeat("host")).toBe("host");
    expect(normalizeStreamOverlaySeat("away")).toBe("away");
    expect(normalizeStreamOverlaySeat("HOST")).toBe("host");
  });

  it("normalizes invalid values to host", () => {
    expect(normalizeStreamOverlaySeat("invalid")).toBe("host");
    expect(normalizeStreamOverlaySeat("spectator")).toBe("host");
  });
});

describe("parseStreamOverlayParams", () => {
  it("parses and trims selector params", () => {
    const params = new URLSearchParams(
      "apiKey=ltcg_key_1&hostId=user_42&matchId=match_7&seat=away",
    );
    expect(parseStreamOverlayParams(params)).toEqual({
      apiKey: "ltcg_key_1",
      hostId: "user_42",
      matchId: "match_7",
      seat: "away",
    });
  });

  it("normalizes empty values to null", () => {
    const params = new URLSearchParams("apiKey=%20%20&hostId=&matchId=&seat=");
    expect(parseStreamOverlayParams(params)).toEqual({
      apiKey: null,
      hostId: null,
      matchId: null,
      seat: null,
    });
  });

  it("normalizes invalid seat values to host", () => {
    const params = new URLSearchParams("seat=nonsense");
    expect(parseStreamOverlayParams(params).seat).toBe("host");
  });
});
