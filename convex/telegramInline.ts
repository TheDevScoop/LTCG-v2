type MatchSeat = "host" | "away";

export type InlineAction = {
  label: string;
  command: Record<string, unknown>;
};

type InlineBoardCard = {
  cardId?: string;
  faceDown?: boolean;
  canAttack?: boolean;
  hasAttackedThisTurn?: boolean;
  turnSummoned?: number;
};

type InlineSpellTrapCard = {
  cardId?: string;
  definitionId?: string;
  faceDown?: boolean;
};

type InlineCardMeta = {
  type: string;
  level: number;
};

type ValidActions = {
  canSummon: Map<string, { positions: ("attack" | "defense")[]; needsTribute: boolean }>;
  canSetMonster: Set<string>;
  canSetSpellTrap: Set<string>;
  canActivateSpell: Set<string>;
  canActivateTrap: Set<string>;
  canAttack: Map<string, string[]>;
  canFlipSummon: Set<string>;
};

const MAX_BOARD_SLOTS = 3;
const MAX_SPELL_TRAP_SLOTS = 3;
const TRIBUTE_LEVEL = 7;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toBoard(value: unknown): InlineBoardCard[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => isRecord(entry)) as InlineBoardCard[];
}

function toSpellTrapZone(value: unknown): InlineSpellTrapCard[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => isRecord(entry)) as InlineSpellTrapCard[];
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string");
}

function deriveValidActions(params: {
  view: Record<string, unknown>;
  cardMetaById: Map<string, InlineCardMeta>;
  seat: MatchSeat;
}) {
  const { view, cardMetaById, seat } = params;
  const va: ValidActions = {
    canSummon: new Map(),
    canSetMonster: new Set(),
    canSetSpellTrap: new Set(),
    canActivateSpell: new Set(),
    canActivateTrap: new Set(),
    canAttack: new Map(),
    canFlipSummon: new Set(),
  };

  const gameOver = view.gameOver === true;
  if (gameOver) return va;

  const isChainWindow = Array.isArray(view.currentChain) && view.currentChain.length > 0;
  const isMyTurn = toString(view.currentTurnPlayer) === seat;
  const isChainResponder = toString(view.currentPriorityPlayer) === seat;
  if (isChainWindow && !isChainResponder) return va;
  if (!isChainWindow && !isMyTurn) return va;

  const currentPhase = toString(view.currentPhase) ?? "draw";
  const isMainPhase = currentPhase === "main" || currentPhase === "main2";
  const board = toBoard(view.board);
  const hand = toStringArray(view.hand);
  const spellTrapZone = toSpellTrapZone(view.spellTrapZone);
  const opponentBoard = toBoard(view.opponentBoard);
  const turnNumber = toNumber(view.turnNumber) ?? 1;

  if (isMainPhase) {
    if (board.length < MAX_BOARD_SLOTS) {
      for (const cardId of hand) {
        const cardMeta = cardMetaById.get(cardId);
        if (!cardMeta) continue;
        if (cardMeta.type === "stereotype") {
          const needsTribute = cardMeta.level >= TRIBUTE_LEVEL;
          va.canSummon.set(cardId, { positions: ["attack", "defense"], needsTribute });
          va.canSetMonster.add(cardId);
        }
      }
    }

    if (spellTrapZone.length < MAX_SPELL_TRAP_SLOTS) {
      for (const cardId of hand) {
        const cardMeta = cardMetaById.get(cardId);
        if (!cardMeta) continue;
        if (cardMeta.type === "spell") {
          va.canSetSpellTrap.add(cardId);
          va.canActivateSpell.add(cardId);
        }
        if (cardMeta.type === "trap") {
          va.canSetSpellTrap.add(cardId);
        }
      }
    }

    for (const stCard of spellTrapZone) {
      if (!stCard.faceDown || !stCard.cardId) continue;
      const definitionOrCardId = stCard.definitionId ?? stCard.cardId;
      const cardMeta = cardMetaById.get(definitionOrCardId) ?? cardMetaById.get(stCard.cardId);
      if (!cardMeta) continue;
      if (cardMeta.type === "spell") va.canActivateSpell.add(stCard.cardId);
      if (cardMeta.type === "trap") va.canActivateTrap.add(stCard.cardId);
    }

    for (const boardCard of board) {
      if (!boardCard.cardId) continue;
      if (boardCard.faceDown === true && (boardCard.turnSummoned ?? 0) < turnNumber) {
        va.canFlipSummon.add(boardCard.cardId);
      }
    }
  }

  if (currentPhase === "combat" && turnNumber > 1) {
    const hasFaceUpOpponent = opponentBoard.some((entry) => entry.faceDown !== true);
    for (const monster of board) {
      if (!monster.cardId || monster.faceDown === true) continue;
      if (monster.canAttack !== true || monster.hasAttackedThisTurn === true) continue;
      const targets = opponentBoard
        .map((entry) => entry.cardId)
        .filter((cardId): cardId is string => typeof cardId === "string");
      if (!hasFaceUpOpponent) targets.push("");
      va.canAttack.set(monster.cardId, targets);
    }
  }

  return va;
}

function extractActivatableTrapIds(openPromptData: unknown): string[] {
  if (!isRecord(openPromptData)) return [];
  const rawTraps = Array.isArray(openPromptData.activatableTraps)
    ? openPromptData.activatableTraps
    : Array.isArray(openPromptData.activatableTrapIds)
      ? openPromptData.activatableTrapIds
      : [];
  const cardIds = rawTraps
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (!isRecord(entry)) return null;
      return toString(entry.cardId);
    })
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(cardIds));
}

function shortCardLabel(prefix: string, cardId: string): string {
  return `${prefix} ${cardId.slice(0, 6)}`;
}

export function deriveInlinePrimaryCommands(params: {
  view: Record<string, unknown>;
  cardMetaById: Map<string, InlineCardMeta>;
  seat: MatchSeat;
  openPromptData?: unknown;
}): InlineAction[] {
  const { view, cardMetaById, seat, openPromptData } = params;
  const valid = deriveValidActions({ view, cardMetaById, seat });
  const commands: InlineAction[] = [];

  const isChainWindow = Array.isArray(view.currentChain) && view.currentChain.length > 0;
  if (isChainWindow && toString(view.currentPriorityPlayer) === seat) {
    const activatableTrapIds = extractActivatableTrapIds(openPromptData);
    for (const trapId of activatableTrapIds) {
      if (valid.canActivateTrap.has(trapId)) {
        commands.push({
          label: shortCardLabel("Trap", trapId),
          command: { type: "ACTIVATE_TRAP", cardId: trapId },
        });
      }
    }
    commands.push({ label: "Chain Pass", command: { type: "CHAIN_RESPONSE", pass: true } });
  }

  for (const [cardId, summon] of valid.canSummon) {
    if (!summon.needsTribute) {
      commands.push({
        label: shortCardLabel("Summon", cardId),
        command: { type: "SUMMON", cardId, position: "attack" },
      });
    }
  }
  for (const cardId of valid.canSetMonster) {
    commands.push({
      label: shortCardLabel("Set M", cardId),
      command: { type: "SET_MONSTER", cardId },
    });
  }
  for (const cardId of valid.canSetSpellTrap) {
    commands.push({
      label: shortCardLabel("Set S/T", cardId),
      command: { type: "SET_SPELL_TRAP", cardId },
    });
  }
  for (const cardId of valid.canActivateSpell) {
    commands.push({
      label: shortCardLabel("Cast", cardId),
      command: { type: "ACTIVATE_SPELL", cardId },
    });
  }
  for (const cardId of valid.canFlipSummon) {
    commands.push({
      label: shortCardLabel("Flip", cardId),
      command: { type: "FLIP_SUMMON", cardId },
    });
  }
  for (const [attackerId, targets] of valid.canAttack) {
    commands.push({
      label: shortCardLabel("Attack", attackerId),
      command: { type: "DECLARE_ATTACK", attackerId, targetId: targets[0] },
    });
  }

  const deduped = new Map<string, InlineAction>();
  for (const action of commands) {
    const key = JSON.stringify(action.command);
    if (!deduped.has(key)) deduped.set(key, action);
  }
  return Array.from(deduped.values());
}

export function fallbackInlineCommands(): InlineAction[] {
  return [
    { label: "Advance Phase", command: { type: "ADVANCE_PHASE" } },
    { label: "End Turn", command: { type: "END_TURN" } },
    { label: "Surrender", command: { type: "SURRENDER" } },
  ];
}

export function paginateInlineCommands<T>(items: T[], page: number, pageSize: number) {
  const normalizedPageSize = Math.max(1, Math.trunc(pageSize));
  const totalPages = Math.max(1, Math.ceil(items.length / normalizedPageSize));
  const safePage = Math.min(Math.max(Math.trunc(page), 0), totalPages - 1);
  const start = safePage * normalizedPageSize;
  return {
    page: safePage,
    totalPages,
    items: items.slice(start, start + normalizedPageSize),
  };
}
