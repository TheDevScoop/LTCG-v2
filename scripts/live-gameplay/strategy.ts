import type { CardLookup } from "./cardLookup";

export type Seat = "host" | "away";

export type PlayerView = {
  hand?: string[];
  board?: Array<Record<string, unknown>>;
  spellTrapZone?: Array<Record<string, unknown>>;
  opponentBoard?: Array<Record<string, unknown>>;
  opponentHandCount?: number;
  deckCount?: number;
  opponentDeckCount?: number;
  lifePoints?: number;
  opponentLifePoints?: number;
  currentTurnPlayer?: Seat;
  currentPhase?: string;
  currentChain?: unknown[];
  mySeat?: Seat;
  turnNumber?: number;
  gameOver?: boolean;
  winner?: Seat | null;
  winReason?: string | null;
  maxBoardSlots?: number;
  maxSpellTrapSlots?: number;
  normalSummonedThisTurn?: boolean;
};

function cardName(cardLookup: CardLookup, cardId: string | undefined) {
  if (!cardId) return "card";
  return cardLookup[cardId]?.name ?? cardId;
}

function pickTributeCards(view: PlayerView, cardLookup: CardLookup): string[] | undefined {
  const board = (view.board ?? [])
    .filter(Boolean)
    .filter((entry) => entry.faceDown !== true)
    .filter((entry) => typeof entry.cardId === "string" && typeof entry.definitionId === "string") as Array<{
      cardId: string;
      definitionId: string;
    }>;
  if (board.length === 0) return undefined;
  const sorted = [...board].sort((a, b) => {
    const atkA = Number(cardLookup[a.definitionId]?.attack ?? 0);
    const atkB = Number(cardLookup[b.definitionId]?.attack ?? 0);
    return atkA - atkB;
  });
  return [sorted[0]!.cardId];
}

function chooseMainPhaseCommand(
  view: PlayerView,
  cardLookup: CardLookup,
  phase: "main" | "main2",
) {
  const monsters = (view.hand ?? [])
    .map((cardId) => ({ cardId, def: cardLookup[cardId] }))
    .filter((entry) => entry.def && entry.def.cardType === "stereotype")
    .map((entry) => ({
      ...entry,
      attack: Number(entry.def?.attack ?? 0),
      level: Number(entry.def?.level ?? 0),
    }))
    .sort((a, b) => b.attack - a.attack);

  const boardCount = (view.board ?? []).filter(Boolean).length;
  const maxSlots = typeof view.maxBoardSlots === "number" ? view.maxBoardSlots : 5;
  const spellTrapCount = (view.spellTrapZone ?? []).filter(Boolean).length;
  const maxSpellTrapSlots =
    typeof view.maxSpellTrapSlots === "number" ? view.maxSpellTrapSlots : 3;

  if (!view.normalSummonedThisTurn && monsters.length > 0) {
    const candidate = monsters.find((monster) => {
      if (monster.level >= 7) {
        const tribute = pickTributeCards(view, cardLookup);
        if (!tribute || tribute.length !== 1) return false;
        const boardAfterTribute = boardCount - tribute.length;
        return boardAfterTribute < maxSlots;
      }
      return boardCount < maxSlots;
    });

    if (candidate) {
      const tribute = candidate.level >= 7 ? pickTributeCards(view, cardLookup) : undefined;
      return {
        type: "SUMMON" as const,
        cardId: candidate.cardId,
        position: "attack" as const,
        tributeCardIds: tribute && tribute.length > 0 ? tribute : undefined,
        _log: `summon ${cardName(cardLookup, candidate.cardId)} (lvl ${candidate.level})`,
      };
    }
  }

  if (spellTrapCount < maxSpellTrapSlots) {
    const backrow = (view.hand ?? []).find((cardId) => {
      const def = cardLookup[cardId];
      return def && (def.cardType === "spell" || def.cardType === "trap");
    });

    if (backrow) {
      return {
        type: "SET_SPELL_TRAP" as const,
        cardId: backrow,
        _log: `set ${cardName(cardLookup, backrow)}`,
      };
    }
  }

  if (phase === "main2") {
    return {
      type: "END_TURN" as const,
      _log: "end turn",
    };
  }

  return {
    type: "ADVANCE_PHASE" as const,
    _log: "advance phase",
  };
}

function chooseCombatCommand(view: PlayerView, cardLookup: CardLookup) {
  const attackers = (view.board ?? [])
    .filter(Boolean)
    .filter((raw) => {
      const c = raw as { faceDown?: boolean; canAttack?: boolean; hasAttackedThisTurn?: boolean };
      return !c.faceDown && c.canAttack && !c.hasAttackedThisTurn;
    });

  if (attackers.length === 0) {
    return { type: "ADVANCE_PHASE" as const, _log: "advance phase" };
  }

  const attacker = attackers[0] as Record<string, unknown>;
  const opponentMonsters = (view.opponentBoard ?? []).filter(Boolean).filter((raw) => !((raw as any).faceDown));

  if (opponentMonsters.length === 0) {
    return {
      type: "DECLARE_ATTACK" as const,
      attackerId: String(attacker.cardId ?? ""),
      _log: `attack direct with ${cardName(cardLookup, String(attacker.definitionId ?? attacker.cardId))}`,
    };
  }

  const orderedTargets = [...opponentMonsters].sort((a, b) => {
    const atkA = Number(cardLookup[String((a as any).definitionId)]?.attack ?? 0);
    const atkB = Number(cardLookup[String((b as any).definitionId)]?.attack ?? 0);
    return atkA - atkB;
  });
  const target = orderedTargets[0] as Record<string, unknown>;

  return {
    type: "DECLARE_ATTACK" as const,
    attackerId: String(attacker.cardId ?? ""),
    targetId: String(target.cardId ?? ""),
    _log: `attack ${cardName(cardLookup, String(target.definitionId ?? target.cardId))} with ${cardName(cardLookup, String(attacker.definitionId ?? attacker.cardId))}`,
  };
}

export function choosePhaseCommand(view: PlayerView, cardLookup: CardLookup) {
  if (["draw", "standby", "breakdown_check", "end"].includes(view.currentPhase ?? "")) {
    return { type: "ADVANCE_PHASE" as const, _log: "advance phase" };
  }

  if (view.currentPhase === "main" || view.currentPhase === "main2") {
    return chooseMainPhaseCommand(view, cardLookup, view.currentPhase);
  }

  if (view.currentPhase === "combat") {
    return chooseCombatCommand(view, cardLookup);
  }

  return { type: "END_TURN" as const, _log: "end turn" };
}

export function stripCommandLog(command: Record<string, unknown> & { _log?: string }) {
  const { _log, ...rest } = command;
  return rest;
}

export function signature(view: PlayerView) {
  return JSON.stringify({
    turn: view.currentTurnPlayer,
    phase: view.currentPhase,
    hand: [...(view.hand ?? [])].sort().join(","),
    boardCount: view.board?.length ?? 0,
    oppBoardCount: view.opponentBoard?.length ?? 0,
    deck: view.deckCount,
    oppDeck: view.opponentDeckCount,
    chain: view.currentChain?.length ?? 0,
    gameOver: view.gameOver ?? false,
  });
}
