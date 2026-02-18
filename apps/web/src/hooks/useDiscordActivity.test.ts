import { describe, expect, it } from "vitest";
import {
  decodeDiscordJoinMatchId,
  encodeDiscordJoinSecret,
  getDiscordScopeErrorMessage,
  parseDiscordTokenAccessToken,
} from "./useDiscordActivity";

describe("useDiscordActivity helpers", () => {
  it("encodes and decodes Discord join secrets", () => {
    const secret = encodeDiscordJoinSecret("abc123");
    expect(secret).toBe("ltcg:match:abc123");
    expect(decodeDiscordJoinMatchId(secret)).toBe("abc123");
  });

  it("accepts plain match ids from custom_id", () => {
    expect(decodeDiscordJoinMatchId("plain-id-42")).toBe("plain-id-42");
  });

  it("rejects empty and reserved ids", () => {
    expect(decodeDiscordJoinMatchId("")).toBeNull();
    expect(decodeDiscordJoinMatchId("   ")).toBeNull();
    expect(decodeDiscordJoinMatchId("undefined")).toBeNull();
    expect(decodeDiscordJoinMatchId("ltcg:match:null")).toBeNull();
  });

  it("parses access_token from Discord token exchange payload", () => {
    expect(parseDiscordTokenAccessToken({ access_token: "abc" })).toBe("abc");
    expect(parseDiscordTokenAccessToken({ access_token: "" })).toBeNull();
    expect(parseDiscordTokenAccessToken({ token: "abc" })).toBeNull();
  });

  it("formats scope authorization errors for silent and interactive flows", () => {
    expect(getDiscordScopeErrorMessage(new Error("denied"), false)).toContain("rich-presence");
    expect(getDiscordScopeErrorMessage(new Error("denied"), false)).toContain("denied");
    expect(getDiscordScopeErrorMessage("blocked", true)).toContain("blocked");
  });
});
