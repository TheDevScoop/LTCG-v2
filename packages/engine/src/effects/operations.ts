/**
 * operations.ts
 *
 * Executes EffectAction objects from card abilities to generate EngineEvent arrays.
 * Translates high-level actions (destroy, damage, boost, etc.) into concrete game events.
 */

import type { GameState, Seat, BoardCard, SpellTrapCard } from "../types/state.js";
import type { EngineEvent } from "../types/events.js";
import type { EffectAction } from "../types/cards.js";
import { opponentSeat } from "../rules/phases.js";
import { expectDefined } from "../internal/invariant.js";

// ── Helper: Find card on board ────────────────────────────────────

export function findBoardCard(state: GameState, cardId: string): { card: BoardCard; seat: Seat } | null {
  const hostCard = state.hostBoard.find((c) => c.cardId === cardId);
  if (hostCard) return { card: hostCard, seat: "host" };

  const awayCard = state.awayBoard.find((c) => c.cardId === cardId);
  if (awayCard) return { card: awayCard, seat: "away" };

  return null;
}

// ── Helper: Find spell/trap card ─────────────────────────────────

function findSpellTrapCard(state: GameState, cardId: string): { card: SpellTrapCard; seat: Seat } | null {
  const hostCard = state.hostSpellTrapZone.find((c) => c.cardId === cardId);
  if (hostCard) return { card: hostCard, seat: "host" };

  const awayCard = state.awaySpellTrapZone.find((c) => c.cardId === cardId);
  if (awayCard) return { card: awayCard, seat: "away" };

  if (state.hostFieldSpell?.cardId === cardId) {
    return { card: state.hostFieldSpell, seat: "host" };
  }
  if (state.awayFieldSpell?.cardId === cardId) {
    return { card: state.awayFieldSpell, seat: "away" };
  }

  return null;
}

type TransferZone =
  | "board"
  | "hand"
  | "spell_trap_zone"
  | "field"
  | "graveyard"
  | "banished"
  | "deck";

function detectCardZone(state: GameState, cardId: string): TransferZone | null {
  if (findBoardCard(state, cardId)) return "board";

  if (state.hostHand.includes(cardId) || state.awayHand.includes(cardId)) {
    return "hand";
  }

  if (
    state.hostSpellTrapZone.some((card) => card.cardId === cardId) ||
    state.awaySpellTrapZone.some((card) => card.cardId === cardId)
  ) {
    return "spell_trap_zone";
  }

  if (state.hostFieldSpell?.cardId === cardId || state.awayFieldSpell?.cardId === cardId) {
    return "field";
  }

  if (state.hostGraveyard.includes(cardId) || state.awayGraveyard.includes(cardId)) {
    return "graveyard";
  }

  if (state.hostBanished.includes(cardId) || state.awayBanished.includes(cardId)) {
    return "banished";
  }

  if (state.hostDeck.includes(cardId) || state.awayDeck.includes(cardId)) {
    return "deck";
  }

  return null;
}

// ── Operation Handlers ───────────────────────────────────────────

function executeDestroy(
  state: GameState,
  action: Extract<EffectAction, { type: "destroy" }>,
  activatingPlayer: Seat,
  _sourceCardId: string,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];

  if (action.target === "all_opponent_monsters") {
    const opponentBoard = activatingPlayer === "host" ? state.awayBoard : state.hostBoard;
    for (const card of opponentBoard) {
      events.push({ type: "CARD_DESTROYED", cardId: card.cardId, reason: "effect" });
      events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId: card.cardId, from: "board" });
    }
  } else if (action.target === "all_spells_traps") {
    const opponentZone = activatingPlayer === "host" ? state.awaySpellTrapZone : state.hostSpellTrapZone;
    const opponentField = activatingPlayer === "host" ? state.awayFieldSpell : state.hostFieldSpell;

    for (const card of opponentZone) {
      events.push({ type: "CARD_DESTROYED", cardId: card.cardId, reason: "effect" });
      events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId: card.cardId, from: "spell_trap_zone" });
    }
    if (opponentField) {
      events.push({ type: "CARD_DESTROYED", cardId: opponentField.cardId, reason: "effect" });
      events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId: opponentField.cardId, from: "field" });
    }
  } else if (action.target === "selected") {
    // Destroy specific targets
    for (const targetId of targets) {
      const boardCard = findBoardCard(state, targetId);
      const spellTrap = boardCard ? null : findSpellTrapCard(state, targetId);

      if (boardCard) {
        events.push({ type: "CARD_DESTROYED", cardId: targetId, reason: "effect" });
        events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId: targetId, from: "board" });
      } else if (spellTrap) {
        events.push({ type: "CARD_DESTROYED", cardId: targetId, reason: "effect" });
        events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId: targetId, from: "spell_trap_zone" });
      }
    }
  }

  return events;
}

function executeDraw(
  state: GameState,
  action: Extract<EffectAction, { type: "draw" }>,
  activatingPlayer: Seat
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const deck = activatingPlayer === "host" ? state.hostDeck : state.awayDeck;

  const actualCount = Math.min(action.count, deck.length);
  for (let i = 0; i < actualCount; i++) {
    const cardId = expectDefined(
      deck[i],
      `effects.operations.executeDraw missing deck card at index ${i}`
    );
    events.push({ type: "CARD_DRAWN", seat: activatingPlayer, cardId });
  }

  return events;
}

function executeDamage(
  _state: GameState,
  action: Extract<EffectAction, { type: "damage" }>,
  activatingPlayer: Seat
): EngineEvent[] {
  const target = action.target === "opponent" ? opponentSeat(activatingPlayer) : activatingPlayer;
  return [{ type: "DAMAGE_DEALT", seat: target, amount: action.amount, isBattle: false }];
}

function executeHeal(
  _state: GameState,
  action: Extract<EffectAction, { type: "heal" }>,
  activatingPlayer: Seat
): EngineEvent[] {
  const target = action.target === "self" ? activatingPlayer : opponentSeat(activatingPlayer);
  // Healing is negative damage
  return [{ type: "DAMAGE_DEALT", seat: target, amount: -action.amount, isBattle: false }];
}

function executeBoostAttack(
  state: GameState,
  action: Extract<EffectAction, { type: "boost_attack" }>,
  sourceCardId: string,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const expiresAt =
    action.duration === "turn" ? "end_of_turn" : "permanent";

  // If no specific targets, apply to source card
  const targetIds = targets.length > 0 ? targets : [sourceCardId];

  for (const targetId of targetIds) {
    const found = findBoardCard(state, targetId);
    if (found) {
      events.push({
        type: "MODIFIER_APPLIED",
        cardId: targetId,
        field: "attack",
        amount: action.amount,
        source: sourceCardId,
        expiresAt,
      });
    }
  }

  return events;
}

function executeBoostDefense(
  state: GameState,
  action: Extract<EffectAction, { type: "boost_defense" }>,
  sourceCardId: string,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const expiresAt =
    action.duration === "turn" ? "end_of_turn" : "permanent";

  // If no specific targets, apply to source card
  const targetIds = targets.length > 0 ? targets : [sourceCardId];

  for (const targetId of targetIds) {
    const found = findBoardCard(state, targetId);
    if (found) {
      events.push({
        type: "MODIFIER_APPLIED",
        cardId: targetId,
        field: "defense",
        amount: action.amount,
        source: sourceCardId,
        expiresAt,
      });
    }
  }

  return events;
}

function executeAddVice(
  state: GameState,
  action: Extract<EffectAction, { type: "add_vice" }>,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];

  for (const targetId of targets) {
    const found = findBoardCard(state, targetId);
    if (found) {
      const newCount = found.card.viceCounters + action.count;
      events.push({ type: "VICE_COUNTER_ADDED", cardId: targetId, newCount });
    }
  }

  return events;
}

function executeRemoveVice(
  state: GameState,
  action: Extract<EffectAction, { type: "remove_vice" }>,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];

  for (const targetId of targets) {
    const found = findBoardCard(state, targetId);
    if (found) {
      const newCount = Math.max(0, found.card.viceCounters - action.count);
      events.push({ type: "VICE_COUNTER_REMOVED", cardId: targetId, newCount });
    }
  }

  return events;
}

function executeBanish(
  state: GameState,
  _action: Extract<EffectAction, { type: "banish" }>,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];

  for (const targetId of targets) {
    const from = detectCardZone(state, targetId);
    if (!from) continue;
    events.push({ type: "CARD_BANISHED", cardId: targetId, from });
  }

  return events;
}

function executeReturnToHand(
  state: GameState,
  _action: Extract<EffectAction, { type: "return_to_hand" }>,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];

  for (const targetId of targets) {
    const from = detectCardZone(state, targetId);
    if (!from) continue;
    events.push({ type: "CARD_RETURNED_TO_HAND", cardId: targetId, from });
  }

  return events;
}

function executeDiscard(
  state: GameState,
  action: Extract<EffectAction, { type: "discard" }>,
  activatingPlayer: Seat
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const targetSeat = action.target === "opponent" ? opponentSeat(activatingPlayer) : activatingPlayer;
  const hand = targetSeat === "host" ? state.hostHand : state.awayHand;

  // Discard from the end of hand (random would require RNG, so use last cards)
  const actualCount = Math.min(action.count, hand.length);
  for (let i = 0; i < actualCount; i++) {
    const handIndex = hand.length - 1 - i;
    const cardId = expectDefined(
      hand[handIndex],
      `effects.operations.executeDiscard missing hand card at index ${handIndex}`
    );
    events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId, from: "hand" });
  }

  return events;
}

function executeSpecialSummon(
  state: GameState,
  action: Extract<EffectAction, { type: "special_summon" }>,
  activatingPlayer: Seat,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];

  // Special summon targets from the specified location
  for (const targetId of targets) {
    const detectedSource = detectCardZone(state, targetId);
    if (!detectedSource) continue;
    if (detectedSource !== action.from) continue;

    events.push({
      type: "SPECIAL_SUMMONED",
      seat: activatingPlayer,
      cardId: targetId,
      from: detectedSource,
      position: "attack",
    });
  }

  return events;
}

function executeChangePosition(
  state: GameState,
  _action: Extract<EffectAction, { type: "change_position" }>,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];

  for (const targetId of targets) {
    const found = findBoardCard(state, targetId);
    if (found) {
      const from = found.card.position;
      const to = from === "attack" ? "defense" : "attack";
      events.push({ type: "POSITION_CHANGED", cardId: targetId, from, to });
    }
  }

  return events;
}

// ── Main Operation Executor ──────────────────────────────────────

/**
 * Execute a single EffectAction and return the generated events.
 */
export function executeAction(
  state: GameState,
  action: EffectAction,
  activatingPlayer: Seat,
  sourceCardId: string,
  targets: string[]
): EngineEvent[] {
  switch (action.type) {
    case "destroy":
      return executeDestroy(state, action, activatingPlayer, sourceCardId, targets);
    case "draw":
      return executeDraw(state, action, activatingPlayer);
    case "damage":
      return executeDamage(state, action, activatingPlayer);
    case "heal":
      return executeHeal(state, action, activatingPlayer);
    case "boost_attack":
      return executeBoostAttack(state, action, sourceCardId, targets);
    case "boost_defense":
      return executeBoostDefense(state, action, sourceCardId, targets);
    case "add_vice":
      return executeAddVice(state, action, targets);
    case "remove_vice":
      return executeRemoveVice(state, action, targets);
    case "banish":
      return executeBanish(state, action, targets);
    case "return_to_hand":
      return executeReturnToHand(state, action, targets);
    case "discard":
      return executeDiscard(state, action, activatingPlayer);
    case "special_summon":
      return executeSpecialSummon(state, action, activatingPlayer, targets);
    case "change_position":
      return executeChangePosition(state, action, targets);
    case "negate":
      // Negate is a no-op in simple chain mode
      return [];
    default:
      // Unknown action type, skip silently
      return [];
  }
}
