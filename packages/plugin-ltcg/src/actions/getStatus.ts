/**
 * Action: CHECK_LTCG_STATUS
 *
 * Reports the current match state: LP, phase, hand count, field counts.
 * Handles no-match and game-over cases gracefully.
 */

import { getClient } from "../client.js";
import { resolveLifePoints } from "../utils.js";
import type {
  Action,
  MatchActive,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "../types.js";

export const getStatusAction: Action = {
  name: "CHECK_LTCG_STATUS",
  similes: ["GAME_STATUS", "CHECK_MATCH", "LTCG_STATUS"],
  description:
    "Check the current status of an active LunchTable match — LP, field, hand count, and phase.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    try {
      getClient();
      return true;
    } catch {
      return false;
    }
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const client = getClient();
    const matchId = client.currentMatchId;

    if (!matchId) {
      const text =
        "No active LunchTable match. Start one with START_DUEL (quick, alias START_LTCG_DUEL) or START_BATTLE (alias START_LTCG_BATTLE).";
      if (callback) await callback({ text });
      return { success: true, data: { hasMatch: false } };
    }

    try {
      if (!client.currentSeat) {
        try {
          await client.syncSeatFromMatch(matchId);
        } catch {}
      }

      const seat = (client.currentSeat ?? "host") as MatchActive["seat"];
      const view = await client.getView(matchId, seat);

      if (view.gameOver) {
        client.setMatch(null);
        const { myLP, oppLP } = resolveLifePoints(view, seat);
        const outcome =
          myLP > oppLP
            ? "Victory!"
            : myLP < oppLP
              ? "Defeat."
              : "Draw.";
        const text = `Game over! LP: You ${myLP} — Opponent ${oppLP}. ${outcome}`;
        if (callback) await callback({ text });
        return { success: true, data: { gameOver: true, outcome } };
      }

      const isMyTurn = view.currentTurnPlayer === seat;
      const { myLP, oppLP } = resolveLifePoints(view, seat);
      const myMonsters = (view.board ?? view.playerField?.monsters ?? []).filter(Boolean);
      const oppMonsters = (
        view.opponentBoard ?? view.opponentField?.monsters ?? []
      ).filter(Boolean);

      const text = [
        `Match: ${matchId}`,
        `Phase: ${view.phase} — ${isMyTurn ? "Your turn" : "Opponent's turn"}`,
        `LP: You ${myLP} / Opponent ${oppLP}`,
        `Hand: ${view.hand?.length ?? 0} cards | Field: ${myMonsters.length} vs ${oppMonsters.length} monsters`,
      ].join("\n");

      if (callback) await callback({ text, action: "CHECK_LTCG_STATUS" });
      return {
        success: true,
        data: { matchId, phase: view.phase, isMyTurn },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) await callback({ text: `Status check failed: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "How's the game going?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me check the match status...",
          action: "CHECK_LTCG_STATUS",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "What's the score?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Checking the current game state...",
          action: "CHECK_LTCG_STATUS",
        },
      },
    ],
  ],
};

