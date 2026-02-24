import type { CardDefinition, PlayerView } from "../../../lib/convexTypes";

export type ValidActions = {
  canSummon: Map<string, { positions: ("attack" | "defense")[]; needsTribute: boolean }>;
  canSetMonster: Set<string>;
  canSetSpellTrap: Set<string>;
  canActivateSpell: Set<string>;
  canActivateTrap: Set<string>;
  canActivateEffect: Map<string, number[]>;
  canAttack: Map<string, string[]>;
  canFlipSummon: Set<string>;
  canChangePosition: Set<string>;
};

const MAX_BOARD_SLOTS = 3;
const MAX_SPELL_TRAP_SLOTS = 3;
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
    canActivateEffect: new Map(),
    canAttack: new Map(),
    canFlipSummon: new Set(),
    canChangePosition: new Set(),
  };

  if (!view || gameOver) return va;

  const board = view.board ?? [];
  const hand = view.hand ?? [];
  const stZone = view.spellTrapZone ?? [];
  const opponentBoard = view.opponentBoard ?? [];
  const instanceDefinitions = view.instanceDefinitions ?? {};
  const isMainPhase = view.currentPhase === "main" || view.currentPhase === "main2";

  // ── During chain window, only the responder can act ──
  if (isChainWindow) {
    if (!isChainResponder) return va;

    // Chain responder can activate set traps and quick-play spells
    for (const stCard of stZone) {
      if (!stCard.faceDown) continue;
      const card = cardLookup[stCard.definitionId];
      if (!card) continue;
      if (card.type === "trap" || card.cardType === "trap") {
        va.canActivateTrap.add(stCard.cardId);
      }
      if (
        (card.type === "spell" || card.cardType === "spell") &&
        (card.spellType === "quick-play")
      ) {
        va.canActivateSpell.add(stCard.cardId);
      }
    }
    return va;
  }

  // ── During opponent's turn (no chain), check for set traps ──
  if (!isMyTurn) {
    for (const stCard of stZone) {
      if (!stCard.faceDown) continue;
      const card = cardLookup[stCard.definitionId];
      if (!card) continue;
      if (card.type === "trap" || card.cardType === "trap") {
        va.canActivateTrap.add(stCard.cardId);
      }
      if (
        (card.type === "spell" || card.cardType === "spell") &&
        (card.spellType === "quick-play")
      ) {
        va.canActivateSpell.add(stCard.cardId);
      }
    }
    return va;
  }

  // ── It's the player's turn ──
  const maxBoardSlots = view.maxBoardSlots ?? MAX_BOARD_SLOTS;
  const maxSpellTrapSlots = view.maxSpellTrapSlots ?? MAX_SPELL_TRAP_SLOTS;
  const alreadyNormalSummoned = view.normalSummonedThisTurn === true;
  const hasTributableMonster = board.some((card) => !card.faceDown);

  if (isMainPhase) {
    if (!alreadyNormalSummoned) {
      for (const cardId of hand) {
        const definitionId = instanceDefinitions[cardId] ?? cardId;
        const card = cardLookup[definitionId];
        if (!card) continue;
        if (card.cardType === "stereotype" || card.type === "stereotype") {
          const level = card.level ?? 0;
          const needsTribute = level >= TRIBUTE_LEVEL;
          const hasSpace = board.length < maxBoardSlots;
          const canTributeIntoSpace = needsTribute && hasTributableMonster;

          if (hasSpace || canTributeIntoSpace) {
            va.canSummon.set(cardId, { positions: ["attack", "defense"], needsTribute });
          }
          if (hasSpace) {
            va.canSetMonster.add(cardId);
          }
        }
      }
    }

    if (stZone.length < maxSpellTrapSlots) {
      for (const cardId of hand) {
        const definitionId = instanceDefinitions[cardId] ?? cardId;
        const card = cardLookup[definitionId];
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
      // Face-up monsters that haven't changed position this turn and weren't summoned this turn
      if (
        !boardCard.faceDown &&
        !boardCard.changedPositionThisTurn &&
        (boardCard.turnSummoned ?? view.turnNumber) < view.turnNumber
      ) {
        va.canChangePosition.add(boardCard.cardId);
      }
    }

    // ACTIVATE_EFFECT: face-up monsters with ignition effects
    for (const boardCard of board) {
      if (boardCard.faceDown) continue;
      const card = cardLookup[boardCard.definitionId];
      if (!card?.effects) continue;

      const activatableIndices: number[] = [];
      for (let i = 0; i < card.effects.length; i++) {
        const eff = card.effects[i];
        if (eff && eff.type === "ignition") {
          activatableIndices.push(i);
        }
      }

      if (activatableIndices.length > 0) {
        va.canActivateEffect.set(boardCard.cardId, activatableIndices);
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
