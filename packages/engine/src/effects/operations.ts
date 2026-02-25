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
    const targetSeat = opponentSeat(activatingPlayer);
    for (const card of opponentBoard) {
      events.push({ type: "CARD_DESTROYED", cardId: card.cardId, reason: "effect" });
      events.push({
        type: "CARD_SENT_TO_GRAVEYARD",
        cardId: card.cardId,
        from: "board",
        sourceSeat: targetSeat,
      });
    }
  } else if (action.target === "all_spells_traps") {
    const opponentZone = activatingPlayer === "host" ? state.awaySpellTrapZone : state.hostSpellTrapZone;
    const opponentField = activatingPlayer === "host" ? state.awayFieldSpell : state.hostFieldSpell;
    const targetSeat = opponentSeat(activatingPlayer);

    for (const card of opponentZone) {
      events.push({ type: "CARD_DESTROYED", cardId: card.cardId, reason: "effect" });
      events.push({
        type: "CARD_SENT_TO_GRAVEYARD",
        cardId: card.cardId,
        from: "spell_trap_zone",
        sourceSeat: targetSeat,
      });
    }
    if (opponentField) {
      events.push({ type: "CARD_DESTROYED", cardId: opponentField.cardId, reason: "effect" });
      events.push({
        type: "CARD_SENT_TO_GRAVEYARD",
        cardId: opponentField.cardId,
        from: "field",
        sourceSeat: targetSeat,
      });
    }
  } else if (action.target === "selected") {
    // Destroy specific targets
    for (const targetId of targets) {
      const boardCard = findBoardCard(state, targetId);
      const spellTrap = boardCard ? null : findSpellTrapCard(state, targetId);

      if (boardCard) {
        events.push({ type: "CARD_DESTROYED", cardId: targetId, reason: "effect" });
        events.push({
          type: "CARD_SENT_TO_GRAVEYARD",
          cardId: targetId,
          from: "board",
          sourceSeat: boardCard.seat,
        });
      } else if (spellTrap) {
        events.push({ type: "CARD_DESTROYED", cardId: targetId, reason: "effect" });
        events.push({
          type: "CARD_SENT_TO_GRAVEYARD",
          cardId: targetId,
          from: "spell_trap_zone",
          sourceSeat: spellTrap.seat,
        });
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
  activatingPlayer: Seat,
  sourceCardId: string,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const expiresAt =
    action.duration === "turn" ? "end_of_turn" : "permanent";

  // Resolve targets: explicit targets > source on board > all friendly monsters
  let targetIds = targets.length > 0 ? targets : [sourceCardId];

  // If the only target is the source and it's not on the board (e.g. spell card
  // that went to graveyard), auto-target the activating player's board monsters.
  if (targetIds.length === 1 && targetIds[0] === sourceCardId && !findBoardCard(state, sourceCardId)) {
    const board = activatingPlayer === "host" ? state.hostBoard : state.awayBoard;
    targetIds = board.map((c) => c.cardId);
  }

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
  activatingPlayer: Seat,
  sourceCardId: string,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const expiresAt =
    action.duration === "turn" ? "end_of_turn" : "permanent";

  // Resolve targets: explicit targets > source on board > all friendly monsters
  let targetIds = targets.length > 0 ? targets : [sourceCardId];

  // If the only target is the source and it's not on the board (e.g. spell card
  // that went to graveyard), auto-target the activating player's board monsters.
  if (targetIds.length === 1 && targetIds[0] === sourceCardId && !findBoardCard(state, sourceCardId)) {
    const board = activatingPlayer === "host" ? state.hostBoard : state.awayBoard;
    targetIds = board.map((c) => c.cardId);
  }

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

    const boardCard = from === "board" ? findBoardCard(state, targetId) : null;
    const spellTrap = boardCard ? null : findSpellTrapCard(state, targetId);
    const sourceSeat =
      boardCard?.seat ??
      spellTrap?.seat ??
      (state.hostHand.includes(targetId)
        ? "host"
        : state.awayHand.includes(targetId)
          ? "away"
          : state.hostGraveyard.includes(targetId)
            ? "host"
            : state.awayGraveyard.includes(targetId)
              ? "away"
              : state.hostBanished.includes(targetId)
                ? "host"
                : state.awayBanished.includes(targetId)
                  ? "away"
                  : state.hostDeck.includes(targetId)
                    ? "host"
                    : state.awayDeck.includes(targetId)
                      ? "away"
                      : undefined);

    // Only zones that can actually be evolved/removed are allowed.
    if (from === "deck") continue;

    events.push({ type: "CARD_BANISHED", cardId: targetId, from, sourceSeat });
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
    const boardCard = findBoardCard(state, targetId);
    const spellTrap = boardCard ? null : findSpellTrapCard(state, targetId);
    const from = detectCardZone(state, targetId);
    if (!from || from === "deck") continue;

    const sourceSeat =
      boardCard?.seat ??
      spellTrap?.seat ??
      (state.hostHand.includes(targetId)
        ? "host"
        : state.awayHand.includes(targetId)
          ? "away"
          : state.hostGraveyard.includes(targetId)
            ? "host"
            : state.awayGraveyard.includes(targetId)
              ? "away"
              : state.hostBanished.includes(targetId)
                ? "host"
                : state.awayBanished.includes(targetId)
                  ? "away"
                  : state.hostDeck.includes(targetId)
                    ? "host"
                    : state.awayDeck.includes(targetId)
                      ? "away"
                      : undefined);

    events.push({
      type: "CARD_RETURNED_TO_HAND",
      cardId: targetId,
      from,
      sourceSeat,
    });
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
    events.push({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId,
      from: "hand",
      sourceSeat: targetSeat,
    });
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

function executeNegate(
  state: GameState,
  activatingPlayer: Seat,
  sourceCardId: string,
): EngineEvent[] {
  const chain = state.currentChain;
  if (chain.length === 0) return [];

  // Find the most recent chain link that isn't already negated and wasn't
  // added by the same player's current negate card (i.e., skip your own link).
  const negated = state.negatedLinks ?? [];
  for (let i = chain.length - 1; i >= 0; i--) {
    if (negated.includes(i)) continue;
    // Don't negate your own chain link that contains this card
    const link = chain[i];
    if (link && link.cardId === sourceCardId) continue;
    return [{
      type: "CHAIN_LINK_NEGATED" as const,
      seat: activatingPlayer,
      negatedLinkIndex: i,
      negatedBy: sourceCardId,
    }];
  }

  return [];
}

function resolveTargetSeats(
  activatingPlayer: Seat,
  target: "self" | "opponent" | "both",
): Seat[] {
  if (target === "self") return [activatingPlayer];
  if (target === "opponent") return [opponentSeat(activatingPlayer)];
  return ["host", "away"];
}

function executeModifyCost(
  _state: GameState,
  action: Extract<EffectAction, { type: "modify_cost" }>,
  activatingPlayer: Seat,
  sourceCardId: string,
): EngineEvent[] {
  return resolveTargetSeats(activatingPlayer, action.target).map((seat) => ({
    type: "COST_MODIFIER_APPLIED",
    seat,
    cardType: action.cardType,
    operation: action.operation,
    amount: action.amount,
    sourceCardId,
    durationTurns: action.durationTurns,
  }));
}

function executeViewTopCards(
  state: GameState,
  action: Extract<EffectAction, { type: "view_top_cards" }>,
  activatingPlayer: Seat,
  sourceCardId: string,
): EngineEvent[] {
  const deck = activatingPlayer === "host" ? state.hostDeck : state.awayDeck;
  const count = Math.max(1, action.count);
  return [{
    type: "TOP_CARDS_VIEWED",
    seat: activatingPlayer,
    cardIds: deck.slice(0, count),
    sourceCardId,
  }];
}

function executeRearrangeTopCards(
  state: GameState,
  action: Extract<EffectAction, { type: "rearrange_top_cards" }>,
  activatingPlayer: Seat,
  sourceCardId: string,
): EngineEvent[] {
  const deck = activatingPlayer === "host" ? state.hostDeck : state.awayDeck;
  const count = Math.max(1, action.count);
  const top = deck.slice(0, count);
  const reordered = action.strategy === "reverse" ? [...top].reverse() : top;
  return [{
    type: "TOP_CARDS_REARRANGED",
    seat: activatingPlayer,
    cardIds: reordered,
    sourceCardId,
  }];
}

function executeApplyRestriction(
  _state: GameState,
  action: Extract<EffectAction, { type: "apply_restriction" }>,
  activatingPlayer: Seat,
  sourceCardId: string,
): EngineEvent[] {
  return resolveTargetSeats(activatingPlayer, action.target).map((seat) => ({
    type: "TURN_RESTRICTION_APPLIED",
    seat,
    restriction: action.restriction,
    sourceCardId,
    durationTurns: action.durationTurns,
  }));
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
      return executeBoostAttack(state, action, activatingPlayer, sourceCardId, targets);
    case "boost_defense":
      return executeBoostDefense(state, action, activatingPlayer, sourceCardId, targets);
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
      return executeNegate(state, activatingPlayer, sourceCardId);
    case "modify_cost":
      return executeModifyCost(state, action, activatingPlayer, sourceCardId);
    case "view_top_cards":
      return executeViewTopCards(state, action, activatingPlayer, sourceCardId);
    case "rearrange_top_cards":
      return executeRearrangeTopCards(state, action, activatingPlayer, sourceCardId);
    case "apply_restriction":
      return executeApplyRestriction(state, action, activatingPlayer, sourceCardId);
    default:
      // Unknown action type, skip silently
      return [];
  }
}
