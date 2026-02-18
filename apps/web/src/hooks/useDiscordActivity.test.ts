import { describe, expect, it } from "vitest";
import { decodeDiscordJoinMatchId, encodeDiscordJoinSecret } from "./useDiscordActivity";

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
});
