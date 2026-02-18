/**
 * Action: START_LTCG_DUEL
 *
 * Starts a quick AI-vs-human duel with no story chapter.
 * Requires a deck to be selected for the agent.
 */

import { getClient } from "../client.js";
import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "../types.js";

export const startDuelAction: Action = {
  name: "START_LTCG_DUEL",
  similes: ["START_DUEL", "QUICK_MATCH", "PLAY_AGAINST_AI", "PLAY_DUEL"],
  description:
    "Start a quick duel against an AI opponent. Uses the currently selected deck and returns the active match ID.",

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
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => startDuelHandler(
    _runtime,
    _message,
    _state,
    _options,
    callback,
  ),

  examples: [
    [
      { name: "{{user1}}", content: { text: "Start a duel against AI" } },
      {
        name: "{{agent}}",
        content: {
          text: "Starting a quick AI duel now.",
          action: "START_LTCG_DUEL",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Play a quick card game match" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll spin up a duel match against the AI.",
          action: "START_LTCG_DUEL",
        },
      },
    ],
  ],
};

export const startDuelAliasAction: Action = {
  name: "START_DUEL",
  similes: ["START_DUEL", "START_LTCG_DUEL", "DUEL_VS_AI", "QUICK_MATCH"],
  description:
    "Compatibility alias for START_LTCG_DUEL. Start a quick duel against an AI opponent.",
  validate: startDuelAction.validate,
  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => startDuelHandler(
    _runtime,
    _message,
    _state,
    _options,
    callback,
  ),
  examples: startDuelAction.examples,
};

async function startDuelHandler(
  _runtime: IAgentRuntime,
  _message: Memory,
  _state?: State,
  _options?: Record<string, unknown>,
  callback?: HandlerCallback,
) {
  const client = getClient();

  try {
    const me = await client.getMe();

    // Ensure the agent has an active deck — fallback to starter deck selection.
    try {
      const decks = await client.getStarterDecks();
      if (decks.length > 0) {
        const deck = decks[Math.floor(Math.random() * decks.length)];
        await client.selectDeck(deck.deckCode);
      }
    } catch {
      // Ignore; the duel endpoint will surface missing deck errors clearly.
    }

    const result = await client.startDuel();
    await client.setMatchWithSeat(result.matchId);

    const text = `Duel started! Match: ${result.matchId} as ${me.name} vs CPU.`;
    if (callback) await callback({ text, action: "START_LTCG_DUEL" });

    return { success: true, data: { matchId: result.matchId } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const text = `Failed to start duel: ${msg}`;
    if (callback) await callback({ text });
    return { success: false, error: msg };
  }
};
