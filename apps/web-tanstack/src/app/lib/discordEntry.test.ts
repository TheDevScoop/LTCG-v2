import { describe, expect, it } from "vitest";
import { decodeDiscordJoinSecret, resolveDiscordEntryRedirect } from "./discordEntry";

describe("discordEntry", () => {
  it("decodes plain and prefixed join secrets", () => {
    expect(decodeDiscordJoinSecret("abc-123")).toBe("abc-123");
    expect(decodeDiscordJoinSecret("ltcg:match:abc-123")).toBe("abc-123");
  });

  it("rejects empty and reserved values", () => {
    expect(decodeDiscordJoinSecret("")).toBeNull();
    expect(decodeDiscordJoinSecret("   ")).toBeNull();
    expect(decodeDiscordJoinSecret("undefined")).toBeNull();
    expect(decodeDiscordJoinSecret("ltcg:match:null")).toBeNull();
  });

  it("prioritizes explicit join query redirects", () => {
    expect(resolveDiscordEntryRedirect("/", "?join=match-7")).toBe("/duel?join=match-7");
  });

  it("normalizes Discord Activity custom_id launches", () => {
    expect(resolveDiscordEntryRedirect("/", "?custom_id=match-9")).toBe("/duel?join=match-9");
    expect(resolveDiscordEntryRedirect("/", "?custom_id=ltcg%3Amatch%3Amatch-9")).toBe("/duel?join=match-9");
  });

  it("normalizes Discord mobile deep-link secret payloads", () => {
    expect(resolveDiscordEntryRedirect("/_discord/join", "?secret=ltcg%3Amatch%3Axyz")).toBe(
      "/duel?join=xyz",
    );
  });

  it("falls back to duel lobby when deep-link secret is missing", () => {
    expect(resolveDiscordEntryRedirect("/_discord/join", "")).toBe("/duel");
  });

  it("returns null for non-discord launch urls", () => {
    expect(resolveDiscordEntryRedirect("/", "")).toBeNull();
    expect(resolveDiscordEntryRedirect("/about", "?foo=bar")).toBeNull();
  });
});
