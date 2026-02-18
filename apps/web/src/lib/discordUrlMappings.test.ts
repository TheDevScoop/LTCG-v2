import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDiscordUrlMappings,
  buildDiscordUrlMappings,
  deriveDefaultDiscordUrlMappings,
  enableDiscordUrlMappingsForActivity,
  parseDiscordUrlMappings,
} from "./discordUrlMappings";

const ORIGINAL_WINDOW = globalThis.window;

function setMockWindow(windowValue: Window | undefined) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: windowValue,
  });
}

afterEach(() => {
  setMockWindow(ORIGINAL_WINDOW);
});

describe("discordUrlMappings", () => {
  it("derives default convex and convex-site mappings", () => {
    expect(deriveDefaultDiscordUrlMappings("https://foo.convex.cloud")).toEqual([
      { prefix: "/.proxy/convex", target: "foo.convex.cloud" },
      { prefix: "/.proxy/convex-site", target: "foo.convex.site" },
    ]);
  });

  it("parses optional mapping JSON safely", () => {
    expect(parseDiscordUrlMappings('[{"prefix":"/x","target":"api.example.com"}]')).toEqual([
      { prefix: "/x", target: "api.example.com" },
    ]);
    expect(parseDiscordUrlMappings("not-json")).toEqual([]);
    expect(parseDiscordUrlMappings(undefined)).toEqual([]);
  });

  it("builds and dedupes default + custom mappings", () => {
    const result = buildDiscordUrlMappings({
      convexUrl: "https://foo.convex.cloud",
      extraMappingsJson: JSON.stringify([
        { prefix: "/custom", target: "https://api.example.com" },
        { prefix: "/custom", target: "api.example.com" },
      ]),
    });

    expect(result).toContainEqual({ prefix: "/.proxy/convex", target: "foo.convex.cloud" });
    expect(result).toContainEqual({ prefix: "/.proxy/convex-site", target: "foo.convex.site" });
    expect(result).toContainEqual({ prefix: "/custom", target: "api.example.com" });
    expect(result.filter((entry) => entry.prefix === "/custom")).toHaveLength(1);
  });

  it("applies mappings only in browser context", () => {
    const patcher = vi.fn();
    setMockWindow(undefined);
    expect(applyDiscordUrlMappings([{ prefix: "/x", target: "api.example.com" }], patcher)).toBe(false);
    expect(patcher).not.toHaveBeenCalled();

    setMockWindow({ location: { host: "discord.com", protocol: "https:" } } as unknown as Window);
    expect(applyDiscordUrlMappings([{ prefix: "/x", target: "api.example.com" }], patcher)).toBe(true);
    expect(patcher).toHaveBeenCalledOnce();
  });

  it("enables mappings only when Discord Activity is detected", () => {
    setMockWindow({ location: { host: "discord.com", protocol: "https:" } } as unknown as Window);
    const patcher = vi.fn();

    const disabled = enableDiscordUrlMappingsForActivity({
      isDiscordActivity: false,
      convexUrl: "https://foo.convex.cloud",
      extraMappingsJson: undefined,
      patcher,
    });
    expect(disabled).toEqual([]);
    expect(patcher).not.toHaveBeenCalled();

    const enabled = enableDiscordUrlMappingsForActivity({
      isDiscordActivity: true,
      convexUrl: "https://foo.convex.cloud",
      extraMappingsJson: undefined,
      patcher,
    });
    expect(enabled.length).toBeGreaterThan(0);
    expect(patcher).toHaveBeenCalledOnce();
  });
});
