import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentSpectatorView } from "./AgentSpectatorView";

vi.mock("@/hooks/useAgentSpectator", () => {
  return {
    useAgentSpectator: () => ({
      agent: {
        id: "agent_1",
        name: "milunchlady",
        apiKeyPrefix: "ltcg_deadbeef...",
      },
      loading: false,
      error: null,
      matchState: {
        matchId: "m_123",
        seat: "host",
        status: "active",
        mode: "pvp",
        phase: "main",
        turnNumber: 5,
        gameOver: false,
        winner: null,
        isAgentTurn: true,
        chapterId: null,
        stageNumber: null,
        players: {
          agent: {
            lifePoints: 8000,
            deckCount: 30,
            handCount: 4,
            graveyardCount: 2,
            banishedCount: 0,
          },
          opponent: {
            lifePoints: 6200,
            deckCount: 22,
            handCount: 3,
            graveyardCount: 5,
            banishedCount: 1,
          },
        },
        fields: {
          agent: {
            monsters: [{ lane: 0, occupied: true, faceDown: false, position: "attack", name: "Alpha", attack: 1800, defense: 1200, kind: "monster" }],
            spellTraps: [{ lane: 0, occupied: true, faceDown: true, position: null, name: null, attack: null, defense: null, kind: "card" }],
          },
          opponent: {
            monsters: [{ lane: 0, occupied: true, faceDown: true, position: "defense", name: null, attack: null, defense: null, kind: "card" }],
            spellTraps: [{ lane: 0, occupied: false, faceDown: false, position: null, name: null, attack: null, defense: null, kind: null }],
          },
        },
      },
      timeline: [
        {
          version: 3,
          createdAt: 1000,
          actor: "agent",
          eventType: "MONSTER_SUMMONED",
          summary: "Agent summoned a monster",
          rationale: "Develop board presence.",
        },
      ],
      watchMatch: vi.fn(),
    }),
  };
});

describe("AgentSpectatorView", () => {
  it("renders broadcast layout with stream, board, timeline, and chat shell", () => {
    const html = renderToStaticMarkup(
      <AgentSpectatorView
        apiKey="ltcg_test"
        apiUrl="https://example.convex.site"
        hostChatState={{ enabled: true, readOnly: false, messages: [] }}
        hostChatEvent={null}
        onSendChat={() => {}}
      />,
    );

    expect(html).toContain("Embedded Broadcast");
    expect(html).toContain("Stream");
    expect(html).toContain("Public Game Board");
    expect(html).toContain("Action Timeline");
    expect(html).toContain("Chat");
    expect(html).toContain("Agent summoned a monster");
    expect(html).not.toContain("hand\":[");
  });

  it("shows host-chat-required state when not embedded in iframe", () => {
    const html = renderToStaticMarkup(
      <AgentSpectatorView
        apiKey="ltcg_test"
        apiUrl="https://example.convex.site"
        hostChatState={null}
        hostChatEvent={null}
        onSendChat={() => {}}
      />,
    );

    expect(html).toContain("Host chat bridge required");
  });
});
