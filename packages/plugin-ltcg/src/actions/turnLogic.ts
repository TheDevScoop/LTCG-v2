/**
 * Shared turn-playing logic used by both PLAY_LTCG_TURN and PLAY_LTCG_STORY.
 *
 * Plays one full turn:
 * 1. Main phase — summon best-effort and run available magic card actions.
 * 2. Advance to combat.
 * 3. Attack with each eligible monster.
 * 4. End turn.
 */

import { getClient } from "../client.js";
import type {
  BoardCard,
  CardInHand,
  GameCommand,
  MatchActive,
  PlayerView,
} from "../types.js";

type BoardCardLike = BoardCard & { cardId?: string; instanceId?: string };

// Mirrors the engine default config (maxBoardSlots = 3).
const MAX_BOARD_SLOTS = 3;

interface TurnSnapshot {
  phase: PlayerView["phase"];
  turnPlayer: "host" | "away";
  myLife: number;
  oppLife: number;
  handSize: number;
  boardCount: number;
  oppBoardCount: number;
  boardStateSignature: string;
  opponentBoardStateSignature: string;
  chainLength: number;
  gameOver: boolean;
}

/**
 * Play one full turn. Returns actions taken as strings for logging.
 */
export async function playOneTurn(
  matchId: string,
  view: PlayerView,
  seat: MatchActive["seat"] = "host",
): Promise<string[]> {
  const client = getClient();
  const currentView = { value: view };
  const actions: string[] = [];

  const refreshView = async (): Promise<PlayerView> => {
    const next = await client.getView(matchId, seat);
    currentView.value = next;
    return next;
  };

  const logIfProgress = (
    before: TurnSnapshot,
    after: PlayerView,
    text: string,
  ) => {
    const next = snapshot(after, seat);
    if (hasProgress(before, next)) {
      actions.push(text);
      return true;
    }
    currentView.value = after;
    return false;
  };

  const submitAction = async (
    command: GameCommand,
    label: string,
  ): Promise<boolean> => {
    const before = snapshot(currentView.value, seat);
    try {
      await client.submitAction(matchId, command, seat);
    } catch {
      return false;
    }

    const nextView = await refreshView();
    return logIfProgress(before, nextView, label);
  };

  const clearChain = async (): Promise<void> => {
    let attempts = 0;
    let previousSignature = chainStateSignature(currentView.value);

    while (
      Array.isArray(currentView.value.currentChain) &&
      currentView.value.currentChain.length > 0
    ) {
      attempts += 1;
      if (attempts > 20) break;

      if (currentView.value.currentPriorityPlayer === seat) {
        await submitAction(
          { type: "CHAIN_RESPONSE", pass: true },
          "Passed chain response",
        );
      } else {
        await refreshView();
      }

      const nextSignature = chainStateSignature(currentView.value);
      if (nextSignature === previousSignature) {
        break;
      }
      previousSignature = nextSignature;
    }
  };

  const advancePhase = async (): Promise<boolean> => {
    const from = currentView.value.phase;
    const ok = await submitAction(
      { type: "ADVANCE_PHASE" },
      `Advanced phase from ${from}`,
    );
    return ok;
  };

  const endTurn = async (): Promise<boolean> => {
    return submitAction({ type: "END_TURN" }, "Ended turn");
  };

  const getHandIds = (state: PlayerView): string[] =>
    dedupe(
      (state.hand ?? [])
        .map((card: CardInHand) => String(card).trim())
        .filter(Boolean),
    );

  const getBoard = (state: PlayerView): BoardCardLike[] => {
    const legacyBoard = (state.playerField?.monsters ?? []) as Array<
      BoardCardLike | null
    >;
    const modernBoard = (state.board ?? []) as Array<BoardCardLike | null>;
    return [...legacyBoard, ...modernBoard].filter(Boolean) as BoardCardLike[];
  };

  const getOpponentBoard = (state: PlayerView): BoardCardLike[] => {
    const legacyBoard = (state.opponentField?.monsters ?? []) as Array<
      BoardCardLike | null
    >;
    const modernBoard = (state.opponentBoard ?? []) as Array<BoardCardLike | null>;
    return [...legacyBoard, ...modernBoard].filter(Boolean) as BoardCardLike[];
  };

  const getSpellTrapZone = (state: PlayerView): BoardCardLike[] => {
    const spellTrap = (state.spellTrapZone ?? []) as Array<BoardCardLike | null>;
    const legacy = (state.playerField?.spellTraps ?? []) as Array<
      BoardCardLike | null
    >;
    return [...spellTrap, ...legacy].filter(Boolean) as BoardCardLike[];
  };

  const summonFromHand = async (ids: string[]): Promise<boolean> => {
    for (const cardId of ids) {
      const board = getBoard(currentView.value);
      if (board.length >= MAX_BOARD_SLOTS) return false;

      const summoned = await submitAction(
        {
          type: "SUMMON",
          cardId,
          position: "attack",
        },
        `Summoned ${cardId}`,
      );
      if (summoned) return true;

      if (board.length > 0) {
        const tribute = board[0]?.cardId ?? board[0]?.instanceId;
        if (tribute) {
          const tributed = await submitAction(
            {
              type: "SUMMON",
              cardId,
              position: "attack",
              tributeCardIds: [tribute],
            },
            `Summoned ${cardId} with tribute ${tribute}`,
          );
          if (tributed) return true;
        }
      }
    }
    return false;
  };

  const setBackrowFromHand = async (ids: string[]): Promise<void> => {
    for (const cardId of ids) {
      const set = await submitAction(
        { type: "SET_SPELL_TRAP", cardId },
        `Set spell/trap ${cardId}`,
      );
      if (set) {
        await clearChain();
        await refreshView();
      }
    }
  };

  const castSpellsFromHand = async (ids: string[]): Promise<void> => {
    for (const cardId of ids) {
      const cast = await submitAction(
        { type: "ACTIVATE_SPELL", cardId },
        `Activated spell ${cardId}`,
      );
      if (cast) {
        await clearChain();
        await refreshView();
      }
    }
  };

  const triggerFaceDownTraps = async (): Promise<void> => {
    const cards = getSpellTrapZone(currentView.value);
    for (const card of cards) {
      if (!card.faceDown) continue;
      const cardId = card.cardId ?? card.instanceId;
      if (!cardId) continue;
      const activated = await submitAction(
        { type: "ACTIVATE_TRAP", cardId },
        `Activated trap ${cardId}`,
      );
      if (activated) {
        await clearChain();
      }
    }
  };

  const combat = async () => {
    while (
      currentView.value.currentTurnPlayer === seat &&
      !currentView.value.gameOver &&
      currentView.value.phase === "combat"
    ) {
      const attacker = getBoard(currentView.value)
        .filter((card) => !card.faceDown)
        .filter((card) => card.canAttack !== false)
        .filter((card) => !card.hasAttackedThisTurn)[0];

      if (!attacker) break;

      const attackerId = attacker.cardId ?? attacker.instanceId;
      if (!attackerId) break;

      const opponentBoard = getOpponentBoard(currentView.value);
      const possibleTargets =
        opponentBoard.length > 0
          ? opponentBoard
              .map((card) => card.cardId ?? card.instanceId)
              .filter(Boolean)
          : [undefined];

      let attacked = false;
      for (const targetId of possibleTargets) {
        const didAttack = await submitAction(
          {
            type: "DECLARE_ATTACK",
            attackerId,
            ...(targetId ? { targetId } : {}),
          },
          targetId
            ? `Monster ${attackerId} attacked ${targetId}`
            : `Monster ${attackerId} attacked directly`,
        );
        if (didAttack) {
          attacked = true;
          break;
        }
      }

      if (!attacked) {
        break;
      }

      await clearChain();
      if (currentView.value.gameOver) break;
      const afterAttack = await refreshView();
      if (
        afterAttack.currentTurnPlayer !== seat ||
        afterAttack.phase !== "combat"
      ) {
        break;
      }
    }
  };

  await clearChain();
  await refreshView();

  if (currentView.value.currentTurnPlayer !== seat || currentView.value.gameOver) {
    return actions;
  }

  // Ensure we're in a playable phase.
  while (
    currentView.value.currentTurnPlayer === seat &&
    !currentView.value.gameOver &&
    !["main", "main2", "combat", "end"].includes(currentView.value.phase)
  ) {
    const moved = await advancePhase();
    if (!moved) break;
    await clearChain();
  }

  // ── Main phase: summon + spells/traps ─────────────────────────
  if (currentView.value.phase === "main" || currentView.value.phase === "main2") {
    const handIds = getHandIds(currentView.value);

    await summonFromHand(handIds);
    await refreshView();
    await clearChain();

    const afterSummonHand = getHandIds(currentView.value);
    await refreshView();
    await castSpellsFromHand(afterSummonHand);
    await clearChain();

    const afterCastHand = getHandIds(currentView.value);
    await setBackrowFromHand(afterCastHand);
    await clearChain();

    await triggerFaceDownTraps();
    await clearChain();
  }

  // ── Enter combat phase ───────────────────────────────────────
  while (
    currentView.value.currentTurnPlayer === seat &&
    !currentView.value.gameOver &&
    currentView.value.phase !== "combat" &&
    currentView.value.phase !== "end"
  ) {
    const moved = await advancePhase();
    if (!moved) break;
    await clearChain();
  }

  await clearChain();
  await refreshView();

  // ── Combat phase: attack with all legal monsters ─────────────
  if (currentView.value.phase === "combat") {
    await combat();
  }

  await refreshView();
  if (currentView.value.gameOver) {
    return actions;
  }

  // ── Resolve phase end / end-turn window.
  if (currentView.value.currentTurnPlayer === seat && !currentView.value.gameOver) {
    if (currentView.value.phase === "combat") {
      await clearChain();
      await advancePhase();
      await clearChain();
    }

    await refreshView();
    if (currentView.value.currentTurnPlayer === seat && !currentView.value.gameOver) {
      if (currentView.value.phase !== "end") {
        await advancePhase();
      }
      await clearChain();
      await refreshView();
      if (currentView.value.currentTurnPlayer === seat && !currentView.value.gameOver) {
        await endTurn();
      }
    }
  }

  return actions;
}

/** Format a game-over summary from the final view */
export function gameOverSummary(
  view: PlayerView,
  seat: MatchActive["seat"] = "host",
): string {
  const { myLP, oppLP } = resolveLifePoints(view, seat);
  if (myLP > oppLP) return `VICTORY! (You: ${myLP} LP — Opponent: ${oppLP} LP)`;
  if (myLP < oppLP) return `DEFEAT. (You: ${myLP} LP — Opponent: ${oppLP} LP)`;
  return `DRAW. (Both: ${myLP} LP)`;
}

function resolveLifePoints(
  view: {
    lifePoints?: number;
    opponentLifePoints?: number;
    players?: {
      host: { lifePoints: number };
      away: { lifePoints: number };
    };
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

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

function chainStateSignature(state: PlayerView): string {
  const chain = Array.isArray(state.currentChain) ? state.currentChain : [];
  const chainSnapshot = chain.map((link, index) => {
    if (!link || typeof link !== "object") {
      return `${index}:null`;
    }
    const entry = link as Record<string, unknown>;
    const cardId = typeof entry.cardId === "string" ? entry.cardId : "";
    const effectIndex = typeof entry.effectIndex === "number" ? entry.effectIndex : 0;
    const by = typeof entry.activatingPlayer === "string" ? entry.activatingPlayer : "";
    return `${index}:${cardId}:${effectIndex}:${by}`;
  });
  const priority = state.currentPriorityPlayer ?? "null";
  const passer = state.currentChainPasser ?? "null";
  return `${chain.length}|${priority}|${passer}|${chainSnapshot.join(";")}`;
}

function boardStateSignature(cards: BoardCardLike[]): string {
  return cards
    .filter(Boolean)
    .map(
      (card) =>
        `${card.cardId ?? card.instanceId ?? "unknown"}|` +
        `${card.canAttack ?? true}|` +
        `${card.hasAttackedThisTurn ?? false}|` +
        `${card.faceDown ?? false}`,
    )
    .sort()
    .join(";");
}

function snapshot(view: PlayerView, seat: MatchActive["seat"]): TurnSnapshot {
  const lifePoints = resolveLifePoints(view, seat);
  const board = (view.board?.length
    ? view.board
    : view.playerField?.monsters ?? []) as Array<BoardCardLike>;
  const opponentBoard = (
    view.opponentBoard?.length
      ? view.opponentBoard
      : view.opponentField?.monsters ?? []
  ) as Array<BoardCardLike>;

  return {
    phase: view.phase,
    turnPlayer: view.currentTurnPlayer,
    myLife: lifePoints.myLP,
    oppLife: lifePoints.oppLP,
    handSize: (view.hand ?? []).length,
    boardCount: board.length,
    oppBoardCount: (
      view.opponentBoard ?? view.opponentField?.monsters ?? []
    ).length,
    boardStateSignature: boardStateSignature(board),
    opponentBoardStateSignature: boardStateSignature(opponentBoard),
    chainLength: Array.isArray(view.currentChain) ? view.currentChain.length : 0,
    gameOver: Boolean(view.gameOver),
  };
}

function hasProgress(before: TurnSnapshot, after: TurnSnapshot): boolean {
  if (before.gameOver !== after.gameOver) return true;
  if (before.turnPlayer !== after.turnPlayer) return true;
  if (before.phase !== after.phase) return true;
  if (before.myLife !== after.myLife) return true;
  if (before.oppLife !== after.oppLife) return true;
  if (before.handSize !== after.handSize) return true;
  if (before.boardCount !== after.boardCount) return true;
  if (before.oppBoardCount !== after.oppBoardCount) return true;
  if (before.boardStateSignature !== after.boardStateSignature) return true;
  if (before.opponentBoardStateSignature !== after.opponentBoardStateSignature) {
    return true;
  }
  return before.chainLength !== after.chainLength;
}
