import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onHostMessage, sendChatToHost } from "./iframe";

type Listener = (event: { origin: string; data: unknown }) => void;

function installFakeWindow() {
  const listeners: Listener[] = [];
  const postMessage = vi.fn();

  const fakeWindow = {
    self: {},
    top: {},
    parent: { postMessage },
    addEventListener: (type: string, listener: Listener) => {
      if (type === "message") listeners.push(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      if (type !== "message") return;
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    },
  };

  (globalThis as any).window = fakeWindow;

  return {
    postMessage,
    dispatch(origin: string, data: unknown) {
      for (const listener of [...listeners]) {
        listener({ origin, data });
      }
    },
  };
}

describe("iframe protocol", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("VITE_MILAIDY_ALLOW_OPAQUE_ORIGINS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as any).window;
  });

  it("accepts both legacy and prefixed start-match host commands", () => {
    const env = installFakeWindow();
    const received: string[] = [];
    const off = onHostMessage((message) => {
      received.push(message.type);
    });

    env.dispatch("https://milaidy.app", { type: "START_MATCH", mode: "pvp" });
    env.dispatch("https://milaidy.app", { type: "LTCG_START_MATCH", mode: "story" });
    off();

    expect(received).toEqual(["START_MATCH", "LTCG_START_MATCH"]);
  });

  it("rejects unauthorized origins and unknown message types", () => {
    const env = installFakeWindow();
    const handler = vi.fn();
    onHostMessage(handler);

    env.dispatch("https://evil.example", { type: "START_MATCH", mode: "pvp" });
    env.dispatch("https://milaidy.app", { type: "NOT_REAL", mode: "pvp" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects opaque origins by default", () => {
    const env = installFakeWindow();
    const handler = vi.fn();
    onHostMessage(handler);

    env.dispatch("null", { type: "START_MATCH", mode: "pvp" });
    env.dispatch("file://", { type: "START_MATCH", mode: "pvp" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("accepts opaque origins only with explicit dev opt-in", () => {
    vi.stubEnv("VITE_MILAIDY_ALLOW_OPAQUE_ORIGINS", "true");
    const env = installFakeWindow();
    const received: string[] = [];
    onHostMessage((message) => {
      received.push(message.type);
    });

    env.dispatch("null", { type: "START_MATCH", mode: "pvp" });
    env.dispatch("file://", { type: "LTCG_START_MATCH", mode: "story" });

    expect(received).toEqual(["START_MATCH", "LTCG_START_MATCH"]);
  });

  it("sends chat messages to host with LTCG_CHAT_SEND type", () => {
    const env = installFakeWindow();

    sendChatToHost({
      text: "hello from embed",
      matchId: "m_123",
      agentId: "a_1",
    });

    expect(env.postMessage).toHaveBeenCalledWith(
      {
        type: "LTCG_CHAT_SEND",
        text: "hello from embed",
        matchId: "m_123",
        agentId: "a_1",
      },
      "*",
    );
  });
});
