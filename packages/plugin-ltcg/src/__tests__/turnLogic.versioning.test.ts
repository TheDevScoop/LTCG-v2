import { describe, expect, it, vi } from "vitest";
import { initClient } from "../client.js";
import { playOneTurn } from "../actions/turnLogic.js";
import type { PlayerView } from "../types.js";

function baseStatus(latestSnapshotVersion: number) {
  return {
    matchId: "match_1",
    status: "active",
    mode: "pvp",
    winner: null,
    endReason: null,
    isGameOver: false,
    hostId: "host_user",
    awayId: "away_user",
    seat: "host" as const,
    chapterId: null,
    stageNumber: null,
    outcome: null,
    starsEarned: null,
    latestSnapshotVersion,
  };
}

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    gameOver: false,
    phase: "main",
    currentTurnPlayer: "host",
    hand: [],
    board: [],
    opponentBoard: [],
    currentChain: [],
    currentPriorityPlayer: null,
    currentChainPasser: null,
    mySeat: "host",
    lifePoints: 8000,
    opponentLifePoints: 8000,
    ...overrides,
  };
}

describe("playOneTurn expectedVersion threading", () => {
  it("threads returned snapshot version into subsequent submit calls", async () => {
    const client = initClient("http://example.invalid", "ltcg_test_key");
    const state = { phase: "main" as PlayerView["phase"], turn: "host" as "host" | "away" };
    let version = 12;

    const getMatchStatus = vi.fn(async () => baseStatus(version));
    const getView = vi.fn(async () =>
      makeView({
        phase: state.phase,
        currentTurnPlayer: state.turn,
      }),
    );
    const submitAction = vi.fn(async (_matchId: string, command: { type: string }, expectedVersion: number) => {
      expect(expectedVersion).toBe(version);
      if (command.type === "ADVANCE_PHASE") {
        state.phase = "end";
      } else if (command.type === "END_TURN") {
        state.turn = "away";
      }
      version += 1;
      return { events: "[]", version };
    });

    Object.assign(client, {
      getMatchStatus,
      getView,
      submitAction,
    });

    await playOneTurn("match_1", makeView(), "host");

    expect(getMatchStatus).toHaveBeenCalledTimes(1);
    expect(submitAction.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(submitAction.mock.calls[0]?.[2]).toBe(12);
    expect(submitAction.mock.calls[1]?.[2]).toBe(13);
  });

  it("refreshes latestSnapshotVersion once on version mismatch and retries", async () => {
    const client = initClient("http://example.invalid", "ltcg_test_key");
    const statusVersions = [20, 21];
    const state = { phase: "main" as PlayerView["phase"], turn: "host" as "host" | "away" };
    let failFirstSubmit = true;

    const getMatchStatus = vi.fn(async () => baseStatus(statusVersions.shift() ?? 21));
    const getView = vi.fn(async () =>
      makeView({
        phase: state.phase,
        currentTurnPlayer: state.turn,
      }),
    );
    const submitAction = vi.fn(async (_matchId: string, command: { type: string }, expectedVersion: number) => {
      if (failFirstSubmit) {
        failFirstSubmit = false;
        throw new Error("submitAction version mismatch; state updated by another action.");
      }

      if (command.type === "ADVANCE_PHASE") {
        state.phase = "end";
      } else if (command.type === "END_TURN") {
        state.turn = "away";
      }

      return { events: "[]", version: expectedVersion + 1 };
    });

    Object.assign(client, {
      getMatchStatus,
      getView,
      submitAction,
    });

    await playOneTurn("match_1", makeView(), "host");

    expect(getMatchStatus).toHaveBeenCalledTimes(2);
    expect(submitAction.mock.calls[0]?.[2]).toBe(20);
    expect(submitAction.mock.calls[1]?.[2]).toBe(21);
    expect(submitAction.mock.calls[2]?.[2]).toBe(22);
  });
});
