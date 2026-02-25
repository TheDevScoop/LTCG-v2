/**
 * Action: SURRENDER_LTCG
 *
 * Surrenders the current match. Use when the game is unwinnable
 * or the user/agent wants to stop playing.
 */

import { getClient } from "../client.js";
import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "../types.js";

export const surrenderAction: Action = {
  name: "SURRENDER_LTCG",
  similes: ["FORFEIT", "QUIT_MATCH", "GIVE_UP"],
  description:
    "Surrender the current LunchTable match. Use when the game is unwinnable or the user wants to stop.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    try {
      return getClient().hasActiveMatch;
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
      const text = "No active match to surrender.";
      if (callback) await callback({ text });
      return { success: false, error: "No active match" };
    }

    try {
      const status = await client.getMatchStatus(matchId);
      const expectedVersion = status.latestSnapshotVersion;
      if (typeof expectedVersion !== "number" || !Number.isFinite(expectedVersion)) {
        throw new Error("match-status is missing latestSnapshotVersion");
      }
      await client.submitAction(matchId, { type: "SURRENDER" }, expectedVersion);
      client.setMatch(null);

      const text = `Surrendered match ${matchId}. GG!`;
      if (callback) await callback({ text, action: "SURRENDER_LTCG" });
      return { success: true, data: { matchId } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) await callback({ text: `Failed to surrender: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Just give up, you're losing badly" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "GG, I'll surrender this one.",
          action: "SURRENDER_LTCG",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Stop the game" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Alright, forfeiting the match.",
          action: "SURRENDER_LTCG",
        },
      },
    ],
  ],
};
