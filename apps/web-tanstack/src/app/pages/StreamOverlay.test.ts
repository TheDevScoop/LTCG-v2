import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StreamOverlayParams } from "@/lib/streamOverlayParams";
import { StreamOverlay } from "./StreamOverlay";

const searchParamsState = { value: new URLSearchParams() };
const useStreamOverlayMock = vi.fn();

vi.mock("@/router/react-router", () => ({
  useSearchParams: () => [searchParamsState.value],
}));

vi.mock("@/hooks/useStreamOverlay", () => ({
  useStreamOverlay: (params: StreamOverlayParams) => useStreamOverlayMock(params),
}));

const baseOverlayData = {
  loading: false,
  error: null,
  agentName: "Agent",
  agentId: "agent_1",
  matchState: null,
  timeline: [],
  cardLookup: {},
  chatMessages: [],
  agentMonsters: [],
  opponentMonsters: [],
  agentSpellTraps: [],
  opponentSpellTraps: [],
};

describe("StreamOverlay", () => {
  beforeEach(() => {
    searchParamsState.value = new URLSearchParams();
    useStreamOverlayMock.mockReset();
    useStreamOverlayMock.mockReturnValue(baseOverlayData);
  });

  it("shows selector-required state when no apiKey, hostId, or matchId is provided", () => {
    const html = renderToStaticMarkup(createElement(StreamOverlay));
    expect(html).toContain("Missing apiKey, hostId, or matchId parameter");
    expect(useStreamOverlayMock).toHaveBeenCalledWith({
      apiUrl: null,
      apiKey: null,
      hostId: null,
      matchId: null,
      seat: null,
    });
  });

  it("accepts hostId mode and normalizes invalid seat to host", () => {
    searchParamsState.value = new URLSearchParams("hostId=user_123&seat=INVALID");
    useStreamOverlayMock.mockReturnValue({
      ...baseOverlayData,
      loading: true,
    });

    const html = renderToStaticMarkup(createElement(StreamOverlay));
    expect(html).toContain("Connecting...");
    expect(html).not.toContain("Missing apiKey, hostId, or matchId parameter");
    expect(useStreamOverlayMock).toHaveBeenCalledWith({
      apiUrl: null,
      apiKey: null,
      hostId: "user_123",
      matchId: null,
      seat: "host",
    });
  });

  it("passes apiKey/matchId/seat overrides to stream data hook", () => {
    searchParamsState.value = new URLSearchParams("apiKey=ltcg_key&matchId=match_9&seat=away");
    useStreamOverlayMock.mockReturnValue({
      ...baseOverlayData,
      error: "overlay error",
    });

    const html = renderToStaticMarkup(createElement(StreamOverlay));
    expect(html).toContain("overlay error");
    expect(useStreamOverlayMock).toHaveBeenCalledWith({
      apiUrl: null,
      apiKey: "ltcg_key",
      hostId: null,
      matchId: "match_9",
      seat: "away",
    });
  });
});
