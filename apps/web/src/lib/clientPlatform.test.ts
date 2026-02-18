import { afterEach, describe, expect, it } from "vitest";
import {
  describeClientPlatform,
  detectClientPlatform,
  formatPlatformTag,
  isDiscordActivityFrame,
  isTelegramMiniApp,
} from "./clientPlatform";

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

describe("clientPlatform", () => {
  it("defaults to web when no special host runtime is detected", () => {
    setMockWindow({
      location: { search: "" },
      self: {},
      top: {},
    } as unknown as Window);

    expect(isTelegramMiniApp()).toBe(false);
    expect(isDiscordActivityFrame()).toBe(false);
    expect(detectClientPlatform()).toBe("web");
  });

  it("detects Telegram mini app context", () => {
    setMockWindow({
      location: { search: "" },
      self: {},
      top: {},
      Telegram: { WebApp: { initData: "token" } },
    } as unknown as Window);

    expect(isTelegramMiniApp()).toBe(true);
    expect(detectClientPlatform()).toBe("telegram");
    expect(describeClientPlatform()).toBe("telegram-mini-app");
  });

  it("detects Discord activity iframe context via query params", () => {
    setMockWindow({
      location: { search: "?frame_id=123&guild_id=456" },
      self: {},
      top: {},
    } as unknown as Window);

    expect(isDiscordActivityFrame()).toBe(true);
    expect(detectClientPlatform()).toBe("discord");
    expect(describeClientPlatform()).toBe("discord-activity");
  });

  it("detects Discord activity when only channel query params are present", () => {
    setMockWindow({
      location: { search: "?channel_id=789" },
      self: {},
      top: {},
    } as unknown as Window);

    expect(isDiscordActivityFrame()).toBe(true);
    expect(detectClientPlatform()).toBe("discord");
  });

  it("formats known platform tags and ignores unknown values", () => {
    expect(formatPlatformTag("discord")).toBe("Discord");
    expect(formatPlatformTag("telegram")).toBe("Telegram");
    expect(formatPlatformTag("web")).toBe("Web");
    expect(formatPlatformTag("agent")).toBe("Agent");
    expect(formatPlatformTag("unknown")).toBeNull();
    expect(formatPlatformTag(undefined)).toBeNull();
  });
});
