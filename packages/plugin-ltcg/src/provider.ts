/**
 * ElizaOS Provider: injects current game state into the agent's LLM context.
 *
 * Runs before every action selection, giving the LLM full visibility into
 * the board state, hand, LP, phase, and turn info.
 */

import { getClient, type LTCGClient } from "./client.js";
import { resolveLifePoints } from "./utils.js";
import type {
  MatchActive,
  IAgentRuntime,
  Memory,
  PlayerView,
  Provider,
  State,
} from "./types.js";

export const gameStateProvider: Provider = {
  name: "ltcg-game-state",
  description:
    "Current LunchTable card game state — board, hand, LP, phase, and turn",

  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    let client: LTCGClient;
    try {
      client = getClient();
    } catch {
      return { text: "" };
    }

    const matchId = client.currentMatchId;
    if (!matchId) {
      return {
        text: "No active LunchTable match. Use START_DUEL (alias for START_LTCG_DUEL), START_BATTLE (alias for START_LTCG_BATTLE), or JOIN_LTCG_MATCH (for human-hosted match) to begin.",
      };
    }

    try {
      const seat: NonNullable<MatchActive["seat"]> = client.currentSeat ?? "host";
      const view = await client.getView(matchId, seat);
      return {
        text: formatView(view, matchId, seat),
        values: {
          ltcgMatchId: matchId,
          ltcgPhase: view.phase,
          ltcgIsMyTurn: String(view.currentTurnPlayer === seat),
          ltcgSeat: seat,
        },
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return {
        text: `Active match ${matchId} — unable to fetch state: ${reason}`,
      };
    }
  },
};

// ── Formatting ───────────────────────────────────────────────────

function formatView(
  v: PlayerView,
  matchId: string,
  seat: MatchActive["seat"],
): string {
  const activeSeat = resolveSeat(seat);

  const { myLP, oppLP } = resolveLifePoints(v, activeSeat);
  if (v.gameOver) {
    const outcome =
      myLP > oppLP ? "VICTORY!" : myLP < oppLP ? "DEFEAT." : "DRAW.";
    return `=== LTCG MATCH ${matchId} — GAME OVER ===\nFinal LP: You ${myLP} — Opponent ${oppLP}\n${outcome}`;
  }

  const isMyTurn = v.currentTurnPlayer === activeSeat;
  const myBoard = getBoard(v, "self");
  const oppBoard = getBoard(v, "opponent");
  const mySpells = getSpellTrap(v, "self");
  const oppSpells = getSpellTrap(v, "opponent");

  const lines: string[] = [
    `=== LTCG MATCH ${matchId} ===`,
    `Phase: ${v.phase} | ${isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN"}`,
    `LP: You ${myLP} | Opponent ${oppLP}`,
    "",
  ];

  const hand = v.hand ?? [];

  lines.push(`Your hand (${hand.length}):`);
  if (hand.length === 0) {
    lines.push("  (empty)");
  } else {
    for (const cardId of hand) {
      lines.push(`  cardId:${cardId}`);
    }
  }

  // Player field
  lines.push("");
  lines.push(`Your monsters (${myBoard.length}):`);
  if (myBoard.length === 0) {
    lines.push("  (empty)");
  } else {
    for (const m of myBoard) {
      lines.push(
        `  ${formatCard(m)} atk:${m.attack ?? "?"} def:${m.defense ?? "?"} pos:${m.position ?? "atk"}`,
      );
    }
  }

  lines.push(`Your back row (${mySpells.length}):`);
  if (mySpells.length === 0) {
    lines.push("  (empty)");
  } else {
    for (const c of mySpells) {
      lines.push(`  ${formatCard(c)} ${c.faceDown ? "facedown" : "faceup"}`);
    }
  }

  // Opponent field
  lines.push("");
  lines.push(`Opponent monsters (${oppBoard.length}):`);
  if (oppBoard.length === 0) {
    lines.push("  (empty)");
  } else {
    for (const m of oppBoard) {
      if (m.faceDown) {
        lines.push("  [Face-down monster]");
      } else {
        lines.push(
          `  ${formatCard(m)} atk:${m.attack ?? "?"} def:${m.defense ?? "?"}`,
        );
      }
    }
  }

  lines.push(`Opponent back row (${oppSpells.length}):`);
  if (oppSpells.length === 0) {
    lines.push("  (empty)");
  } else {
    for (const c of oppSpells) {
      lines.push(`  ${formatCard(c)} ${c.faceDown ? "facedown" : "faceup"}`);
    }
  }

  return lines.join("\n");
}

function resolveSeat(seat: MatchActive["seat"]): "host" | "away" {
  if (seat !== "host" && seat !== "away" && seat !== undefined) {
    console.warn(`[LTCG] Unexpected seat value "${seat}", defaulting to "host".`);
  }
  return seat === "away" ? "away" : "host";
}

function formatCard(card: { cardId?: string; definitionId?: string; instanceId?: string; name?: string }) {
  return card.name ?? card.definitionId ?? card.cardId ?? card.instanceId ?? "unknown card";
}

function getBoard(v: PlayerView, seat: "self" | "opponent") {
  if (seat === "self") {
    return (
      (v.playerField?.monsters ?? v.board ?? []).filter(Boolean) as Array<Record<
        string,
        unknown
      > & { cardId?: string; definitionId?: string; instanceId?: string; attack?: number; defense?: number; position?: string; faceDown?: boolean }>
    );
  }
  return (
    (v.opponentField?.monsters ?? v.opponentBoard ?? []).filter(Boolean) as Array<Record<
      string,
      unknown
    > & { cardId?: string; definitionId?: string; instanceId?: string; attack?: number; defense?: number; position?: string; faceDown?: boolean }>
  );
}

function getSpellTrap(v: PlayerView, seat: "self" | "opponent") {
  if (seat === "self") {
    return (
      (v.spellTrapZone ?? v.playerField?.spellTraps ?? []).filter(Boolean) as Array<Record<
        string,
        unknown
      > & { cardId?: string; definitionId?: string; instanceId?: string; faceDown?: boolean }>
    );
  }
  return (
    (v.opponentSpellTrapZone ?? v.opponentField?.spellTraps ?? []).filter(Boolean) as Array<Record<
      string,
      unknown
    > & { cardId?: string; definitionId?: string; instanceId?: string; faceDown?: boolean }>
  );
}
