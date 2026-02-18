/**
 * Action: JOIN_LTCG_MATCH
 *
 * Join an existing waiting match as the away player.
 * Useful for autonomous agents to take over the away seat for human-created matches.
 */

import { getClient } from "../client.js";
import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "../types.js";

function resolveMatchId(
  options?: Record<string, unknown>,
  message?: Memory,
): string | null {
  const explicit = options?.matchId;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const text = message?.content?.text;
  if (typeof text === "string") {
    const match = text.match(/[A-Za-z0-9_-]{20,}/);
    if (match?.[0]) return match[0];
  }

  return null;
}

export const joinMatchAction: Action = {
  name: "JOIN_LTCG_MATCH",
  similes: ["JOIN_MATCH", "TAKE_AWAY_SEAT", "CONNECT_MATCH", "LTCG_JOIN"],
  description:
    "Join an open match as the away player (for human-created match invitations).",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    try {
      return !getClient().hasActiveMatch;
    } catch {
      return false;
    }
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const client = getClient();

    if (client.hasActiveMatch) {
      const text =
        "An active match already exists. Finish or surrender it before joining another.";
      if (callback) await callback({ text });
      return { success: false, error: "Match already active" };
    }

    const matchId = resolveMatchId(options, message);
    if (!matchId) {
      const text =
        "Join match failed: provide matchId as option (matchId) or include it in the message.";
      if (callback) await callback({ text });
      return { success: false, error: "matchId is required." };
    }

    try {
      const result = await client.joinMatch(matchId);
      const text = `Joined match ${result.matchId} as the away seat against host ${result.hostId}.`;
      if (callback) await callback({ text, action: "JOIN_LTCG_MATCH" });
      return { success: true, data: result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) await callback({ text: `Join failed: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Join match abc123..." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Joining the waiting match as the away player.",
          action: "JOIN_LTCG_MATCH",
        },
      },
    ],
  ],
};
