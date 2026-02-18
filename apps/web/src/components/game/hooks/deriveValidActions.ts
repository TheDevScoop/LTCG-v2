import type { CardDefinition, PlayerView } from "../../../lib/convexTypes";

export type ValidActions = {
  canSummon: Map<string, { positions: ("attack" | "defense")[]; needsTribute: boolean }>;
  canSetMonster: Set<string>;
  canSetSpellTrap: Set<string>;
  canActivateSpell: Set<string>;
  canActivateTrap: Set<string>;
  canAttack: Map<string, string[]>;
  canFlipSummon: Set<string>;
};
const TRIBUTE_LEVEL = 7;

export function deriveValidActions(params: {
  view: PlayerView | null;
  cardLookup: Record<string, CardDefinition>;
  isMyTurn: boolean;
  isChainWindow: boolean;
  isChainResponder: boolean;
  gameOver: boolean;
}) {
  const { view, cardLookup, isMyTurn, isChainWindow, isChainResponder, gameOver } = params;

  const va: ValidActions = {
    canSummon: new Map(),
    canSetMonster: new Set(),
    canSetSpellTrap: new Set(),
    canActivateSpell: new Set(),
    canActivateTrap: new Set(),
    canAttack: new Map(),
    canFlipSummon: new Set(),
  };

  if (!view || gameOver) return va;

  const isMainPhase = view.currentPhase === "main" || view.currentPhase === "main2";
  const board = view.board ?? [];
  const hand = view.hand ?? [];
  const stZone = view.spellTrapZone ?? [];
  const opponentBoard = view.opponentBoard ?? [];
  const maxBoardSlots =
    typeof view.maxBoardSlots === "number" ? view.maxBoardSlots : 3;
  const maxSpellTrapSlots =
    typeof view.maxSpellTrapSlots === "number" ? view.maxSpellTrapSlots : 3;
  const normalSummonedThisTurn = view.normalSummonedThisTurn === true;

  if (isChainWindow) {
    if (!isChainResponder) return va;

    for (const stCard of stZone) {
      if (!stCard.faceDown) continue;
      const card = cardLookup[stCard.definitionId];
      if (!card) continue;
      if (card.type === "trap" || card.cardType === "trap") {
        va.canActivateTrap.add(stCard.cardId);
      }
    }

    return va;
  }

  if (!isMyTurn) return va;

  if (isMainPhase) {
    if (!normalSummonedThisTurn) {
      const faceUpMonsters = board.filter((c) => !c.faceDown);
      for (const cardId of hand) {
        const card = cardLookup[cardId];
        if (!card) continue;
        if (card.cardType === "stereotype" || card.type === "stereotype") {
          const level = card.level ?? 0;
          const needsTribute = level >= TRIBUTE_LEVEL;
          const hasBoardSpace = board.length < maxBoardSlots;
          const canTributeSummon = needsTribute && faceUpMonsters.length > 0;
          if ((needsTribute && canTributeSummon) || (!needsTribute && hasBoardSpace)) {
            va.canSummon.set(cardId, { positions: ["attack", "defense"], needsTribute });
          }
          if (hasBoardSpace) {
            va.canSetMonster.add(cardId);
          }
        }
      }
    }

    if (stZone.length < maxSpellTrapSlots) {
      for (const cardId of hand) {
        const card = cardLookup[cardId];
        if (!card) continue;
        if (card.cardType === "spell" || card.type === "spell") {
          va.canSetSpellTrap.add(cardId);
          va.canActivateSpell.add(cardId);
        }
        if (card.cardType === "trap" || card.type === "trap") {
          va.canSetSpellTrap.add(cardId);
        }
      }
    }

    for (const stCard of stZone) {
      if (!stCard.faceDown) continue;
      const card = cardLookup[stCard.definitionId];
      if (!card) continue;
      if (card.type === "spell" || card.cardType === "spell") {
        va.canActivateSpell.add(stCard.cardId);
      }
      if (card.type === "trap" || card.cardType === "trap") {
        va.canActivateTrap.add(stCard.cardId);
      }
    }

    for (const boardCard of board) {
      if (boardCard.faceDown && (boardCard.turnSummoned ?? 0) < view.turnNumber) {
        va.canFlipSummon.add(boardCard.cardId);
      }
    }
  }

  if (view.currentPhase === "combat" && view.turnNumber > 1) {
    for (const monster of board) {
      if (monster.faceDown || !monster.canAttack || monster.hasAttackedThisTurn) continue;
      const targets: string[] = [];
      for (const opponentMonster of opponentBoard) {
        targets.push(opponentMonster.cardId);
      }
      const hasFaceUpOpponent = opponentBoard.some((card) => !card.faceDown);
      if (!hasFaceUpOpponent) targets.push("");
      va.canAttack.set(monster.cardId, targets);
    }
  }

  return va;
}
