/**
 * Shared utilities used across the LTCG plugin.
 *
 * Centralizes helpers that were previously duplicated in multiple files.
 */

import { getClient } from "./client.js";
import type { AgentInfo, MatchActive } from "./types.js";

/**
 * Resolve life points from a PlayerView, handling both legacy (flat) and
 * modern (per-player) formats.
 */
export function resolveLifePoints(
  view: {
    players?: {
      host: { lifePoints: number };
      away: { lifePoints: number };
    };
    lifePoints?: number;
    opponentLifePoints?: number;
  },
  seat: MatchActive["seat"],
) {
  if (view.lifePoints !== undefined || view.opponentLifePoints !== undefined) {
    return seat === "host"
      ? {
          myLP: view.lifePoints ?? view.opponentLifePoints ?? 0,
          oppLP: view.opponentLifePoints ?? view.lifePoints ?? 0,
        }
      : {
          myLP: view.opponentLifePoints ?? view.lifePoints ?? 0,
          oppLP: view.lifePoints ?? view.opponentLifePoints ?? 0,
        };
  }

  const host = view.players?.host?.lifePoints ?? 0;
  const away = view.players?.away?.lifePoints ?? 0;
  return seat === "host" ? { myLP: host, oppLP: away } : { myLP: away, oppLP: host };
}

/**
 * Ensure the agent has a deck selected. Checks the agent profile first;
 * only auto-selects a random starter deck if none is found.
 *
 * Pass a pre-fetched agent info object to avoid a redundant getMe() call.
 */
export async function ensureDeckSelected(
  agentInfo?: AgentInfo | Record<string, unknown>,
): Promise<void> {
  const client = getClient();
  try {
    const me = agentInfo ?? (await client.getMe());
    const meBag = me as unknown as Record<string, unknown>;
    const activeDeckCode = (() => {
      if (
        typeof meBag.activeDeckCode === "string" &&
        meBag.activeDeckCode.trim()
      ) {
        return meBag.activeDeckCode.trim();
      }
      if (
        typeof meBag.activeDeck === "object" &&
        meBag.activeDeck !== null &&
        typeof (meBag.activeDeck as { deckCode?: unknown }).deckCode ===
          "string"
      ) {
        const value = (meBag.activeDeck as { deckCode?: unknown }).deckCode;
        if (typeof value === "string" && value.trim()) return value.trim();
      }
      return null;
    })();
    if (activeDeckCode) return;
  } catch {
    // Ignore; fallback selection below is best-effort.
  }

  try {
    const decks = await client.getStarterDecks();
    if (decks.length > 0) {
      const deck = decks[Math.floor(Math.random() * decks.length)];
      await client.selectDeck(deck.deckCode);
    }
  } catch {
    // Ignore; game start will surface missing deck errors clearly.
  }
}

/**
 * Format a dialogue array (pre/post match narrative) into a single
 * quoted string for display.
 */
export function formatDialogue(dialogue: unknown): string {
  if (!Array.isArray(dialogue)) {
    return "";
  }

  const lines = dialogue
    .map((line) => {
      if (!line || typeof line !== "object") return "";
      const entry = line as Record<string, unknown>;
      const speaker = typeof entry.speaker === "string" ? entry.speaker.trim() : "";
      const text = typeof entry.text === "string" ? entry.text.trim() : "";

      if (!text) return "";
      if (speaker) return `${speaker}: ${text}`;
      return text;
    })
    .filter(Boolean)
    .join(" ");

  return lines ? `"${lines}"` : "";
}
