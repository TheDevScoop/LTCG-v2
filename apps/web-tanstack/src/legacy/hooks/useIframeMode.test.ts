import { describe, expect, it } from "vitest";
import {
  classifyHostAuthToken,
  deriveDevAgentApiKey,
  deriveIframeEmbedFlags,
} from "./useIframeMode";

describe("deriveIframeEmbedFlags", () => {
  it("treats ?embedded=true as embedded even when not in an iframe", () => {
    expect(
      deriveIframeEmbedFlags({
        isInIframe: false,
        hasEmbedParam: true,
        isDiscordActivity: false,
      }).isEmbedded,
    ).toBe(true);
  });

  it("treats non-Discord iframes as embedded (milaidy)", () => {
    expect(
      deriveIframeEmbedFlags({
        isInIframe: true,
        hasEmbedParam: false,
        isDiscordActivity: false,
      }).isEmbedded,
    ).toBe(true);
  });

  it("does not treat Discord Activities as embedded for milaidy host messaging", () => {
    expect(
      deriveIframeEmbedFlags({
        isInIframe: true,
        hasEmbedParam: false,
        isDiscordActivity: true,
      }).isEmbedded,
    ).toBe(false);
  });
});

describe("deriveDevAgentApiKey", () => {
  it("returns key only when dev+localhost+devAgent flag are set", () => {
    const result = deriveDevAgentApiKey({
      isDev: true,
      hostname: "localhost",
      searchParams: new URLSearchParams("devAgent=1"),
      envApiKey: "ltcg_test_key",
    });
    expect(result).toBe("ltcg_test_key");
  });

  it("returns null outside local hosts", () => {
    const result = deriveDevAgentApiKey({
      isDev: true,
      hostname: "lunchtable.app",
      searchParams: new URLSearchParams("devAgent=1"),
      envApiKey: "ltcg_test_key",
    });
    expect(result).toBeNull();
  });

  it("returns null when key format is invalid", () => {
    const result = deriveDevAgentApiKey({
      isDev: true,
      hostname: "localhost",
      searchParams: new URLSearchParams("devAgent=1"),
      envApiKey: "bad_key",
    });
    expect(result).toBeNull();
  });
});

describe("classifyHostAuthToken", () => {
  it("classifies JWT token shape", () => {
    expect(classifyHostAuthToken("header.payload.signature")).toEqual({
      isApiKey: false,
      isJwt: true,
    });
  });

  it("classifies ltcg api key tokens", () => {
    expect(classifyHostAuthToken("ltcg_abc123")).toEqual({
      isApiKey: true,
      isJwt: false,
    });
  });

  it("returns false flags for unknown token shapes", () => {
    expect(classifyHostAuthToken("not-a-token")).toEqual({
      isApiKey: false,
      isJwt: false,
    });
  });
});
