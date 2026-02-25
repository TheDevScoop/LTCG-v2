import { describe, it, expect } from "vitest";
import { normalizeMatchId } from "./matchIds";

describe("normalizeMatchId", () => {
  it("returns null for undefined input", () => {
    expect(normalizeMatchId(undefined)).toBe(null);
  });

  it("returns null for null input", () => {
    expect(normalizeMatchId(null)).toBe(null);
  });

  it("returns null for empty string", () => {
    expect(normalizeMatchId("")).toBe(null);
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizeMatchId("   ")).toBe(null);
  });

  it("rejects reserved string 'undefined'", () => {
    expect(normalizeMatchId("undefined")).toBe(null);
  });

  it("rejects reserved string 'null'", () => {
    expect(normalizeMatchId("null")).toBe(null);
  });

  it("rejects reserved string 'skip'", () => {
    expect(normalizeMatchId("skip")).toBe(null);
  });

  it("rejects reserved strings case-insensitively", () => {
    expect(normalizeMatchId("UNDEFINED")).toBe(null);
    expect(normalizeMatchId("Null")).toBe(null);
    expect(normalizeMatchId("SKIP")).toBe(null);
    expect(normalizeMatchId("Skip")).toBe(null);
  });

  it("rejects reserved strings with surrounding whitespace", () => {
    expect(normalizeMatchId("  undefined  ")).toBe(null);
    expect(normalizeMatchId(" null ")).toBe(null);
    expect(normalizeMatchId("\tskip\n")).toBe(null);
  });

  it("returns trimmed valid match ID", () => {
    expect(normalizeMatchId("abc123")).toBe("abc123");
  });

  it("trims whitespace from valid match ID", () => {
    expect(normalizeMatchId("  abc123  ")).toBe("abc123");
  });

  it("accepts long alphanumeric IDs", () => {
    const id = "k57d8f4g2h1j3k5l7m9n0p2q4r6s8t0";
    expect(normalizeMatchId(id)).toBe(id);
  });

  it("accepts IDs with special characters", () => {
    expect(normalizeMatchId("match_123-abc")).toBe("match_123-abc");
  });
});
