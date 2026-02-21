/**
 * effects.ts
 *
 * High-level effect resolution for the rules layer:
 * - resolveEffectActions: resolve an effect definition's actions into events
 * - canActivateEffect: check OPT/HOPT constraints and cost requirements
 * - canPayCost: check whether a player can pay a specific cost
 * - generateCostEvents: emit events that pay an effect's cost
 * - getValidTargets: collect valid target cardIds for an effect's targetFilter
 * - hasValidTargets: check whether enough valid targets exist for activation
 * - validateSelectedTargets: verify player-chosen targets are legal
 * - detectTriggerEffects: scan events for matching trigger effects on board cards
 */

import type { GameState, Seat, BoardCard } from "../types/state.js";
import type { EngineEvent } from "../types/events.js";
import type { EffectDefinition, EffectAction, CardType, CostDefinition } from "../types/cards.js";
import { executeAction } from "../effects/operations.js";
import { opponentSeat } from "./phases.js";
import { expectDefined } from "../internal/invariant.js";

// ── Target Validation ────────────────────────────────────────────

/**
 * Collect all valid target cardIds for an effect's TargetFilter.
 *
 * Scans the relevant zones of the game state and returns card IDs that
 * match every constraint in the filter (zone, cardType, owner, attribute).
 *
 * If the effect has no targetFilter this returns an empty array (meaning
 * "no targets required").
 */
export function getValidTargets(
  state: GameState,
  effect: EffectDefinition,
  seat: Seat,
): string[] {
  const filter = effect.targetFilter;
  if (!filter) return [];

  const validIds: string[] = [];
  const opponent = opponentSeat(seat);

  // Determine which sides to inspect based on owner filter
  const checkSelf = !filter.owner || filter.owner === "self" || filter.owner === "any";
  const checkOpponent = !filter.owner || filter.owner === "opponent" || filter.owner === "any";

  const seatsToCheck: Seat[] = [
    ...(checkSelf ? [seat] : []),
    ...(checkOpponent ? [opponent] : []),
  ];

  // Capture narrowed filter for use in closures
  const f = filter;

  // Helper: does a card definition match the filter's cardType?
  function matchesCardType(cardType: CardType | undefined): boolean {
    if (!f.cardType) return true;
    return cardType === f.cardType;
  }

  // Helper: full match for a card ID against the filter
  function matchesFilter(cardId: string): boolean {
    const def = state.cardLookup[cardId];
    if (!def) return false;
    if (!matchesCardType(def.type)) return false;
    if (f.attribute && def.attribute !== f.attribute) return false;
    return true;
  }

  // Board zone (monster zone)
  if (!filter.zone || filter.zone === "board") {
    for (const s of seatsToCheck) {
      const board: BoardCard[] = s === "host" ? state.hostBoard : state.awayBoard;
      for (const bc of board) {
        const lookupId = bc.definitionId;
        const def = state.cardLookup[lookupId];
        if (!def) continue;
        if (!matchesCardType(def.type)) continue;
        if (filter.attribute && def.attribute !== filter.attribute) continue;
        validIds.push(bc.cardId);
      }
    }
  }

  // Hand zone
  if (!filter.zone || filter.zone === "hand") {
    for (const s of seatsToCheck) {
      const hand: string[] = s === "host" ? state.hostHand : state.awayHand;
      for (const cardId of hand) {
        if (matchesFilter(cardId)) validIds.push(cardId);
      }
    }
  }

  // Graveyard zone
  if (!filter.zone || filter.zone === "graveyard") {
    for (const s of seatsToCheck) {
      const gy: string[] = s === "host" ? state.hostGraveyard : state.awayGraveyard;
      for (const cardId of gy) {
        if (matchesFilter(cardId)) validIds.push(cardId);
      }
    }
  }

  // Banished zone
  if (!filter.zone || filter.zone === "banished") {
    for (const s of seatsToCheck) {
      const banished: string[] = s === "host" ? state.hostBanished : state.awayBanished;
      for (const cardId of banished) {
        if (matchesFilter(cardId)) validIds.push(cardId);
      }
    }
  }

  // Deck zone
  if (!filter.zone || filter.zone === "deck") {
    for (const s of seatsToCheck) {
      const deck: string[] = s === "host" ? state.hostDeck : state.awayDeck;
      for (const cardId of deck) {
        if (matchesFilter(cardId)) validIds.push(cardId);
      }
    }
  }

  return validIds;
}

/**
 * Check whether enough valid targets exist for an effect's activation.
 *
 * Returns true when:
 * - The effect has no targetFilter (no targeting required), OR
 * - The effect has no targetCount and at least one valid target exists, OR
 * - There are at least `targetCount` valid targets available.
 */
export function hasValidTargets(
  state: GameState,
  effect: EffectDefinition,
  seat: Seat,
): boolean {
  if (!effect.targetFilter) return true;
  const valid = getValidTargets(state, effect, seat);
  if (effect.targetCount === undefined) {
    return valid.length > 0;
  }
  return valid.length >= effect.targetCount;
}

/**
 * Validate that a set of selected target card IDs are all legal for
 * the given effect and that the count matches targetCount.
 *
 * Returns true when:
 * - The effect has no targetFilter (any targets accepted), OR
 * - Every selected target is in getValidTargets() AND count matches targetCount.
 */
export function validateSelectedTargets(
  state: GameState,
  effect: EffectDefinition,
  seat: Seat,
  selectedTargets: string[],
): boolean {
  if (!effect.targetFilter) return true;

  // If targetCount is specified, enforce exact count
  if (effect.targetCount !== undefined && selectedTargets.length !== effect.targetCount) {
    return false;
  }

  // All selected targets must be in the valid set
  const validSet = new Set(getValidTargets(state, effect, seat));
  return selectedTargets.every((id) => validSet.has(id));
}

// ── Cost Validation ─────────────────────────────────────────────

/**
 * Check whether a player can pay a specific cost.
 */
function canPayCost(
  state: GameState,
  cost: CostDefinition,
  seat: Seat,
  sourceCardId?: string
): boolean {
  const isHost = seat === "host";
  const board = isHost ? state.hostBoard : state.awayBoard;
  const hand = isHost ? state.hostHand : state.awayHand;
  const graveyard = isHost ? state.hostGraveyard : state.awayGraveyard;
  const lp = isHost ? state.hostLifePoints : state.awayLifePoints;

  switch (cost.type) {
    case "tribute": {
      const count = cost.count ?? 1;
      const eligibleMonsters = board.filter((c) => !c.faceDown);
      return eligibleMonsters.length >= count;
    }

    case "discard": {
      const count = cost.count ?? 1;
      // Exclude the card being activated from the count (if it's in hand)
      const handCount = sourceCardId
        ? hand.filter((id) => id !== sourceCardId).length
        : hand.length;
      return handCount >= count;
    }

    case "pay_lp": {
      const amount = cost.amount ?? 0;
      // Player must have strictly more LP than the cost
      return lp > amount;
    }

    case "remove_vice": {
      const count = cost.count ?? 1;
      // Check if any card on the board has enough vice counters
      return board.some((c) => c.viceCounters >= count);
    }

    case "banish": {
      const count = cost.count ?? 1;
      return graveyard.length >= count;
    }

    default:
      return true;
  }
}

/**
 * Generate events to pay the cost of an effect.
 *
 * Returns a COST_PAID event followed by the specific state-change events
 * (CARD_DESTROYED, CARD_SENT_TO_GRAVEYARD, DAMAGE_DEALT, etc.) that
 * actually modify game state.
 *
 * NOTE: This uses deterministic selection (first eligible cards) since the
 * engine doesn't have an interactive cost-selection mechanism yet.
 */
export function generateCostEvents(
  state: GameState,
  cost: CostDefinition,
  seat: Seat,
  sourceCardId?: string
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const isHost = seat === "host";
  const board = isHost ? state.hostBoard : state.awayBoard;
  const hand = isHost ? state.hostHand : state.awayHand;
  const graveyard = isHost ? state.hostGraveyard : state.awayGraveyard;

  switch (cost.type) {
    case "tribute": {
      const count = cost.count ?? 1;
      const eligible = board.filter((c) => !c.faceDown);
      const toTribute = eligible.slice(0, count);

      events.push({ type: "COST_PAID", seat, costType: "tribute", amount: count });
      for (const card of toTribute) {
        events.push({ type: "CARD_DESTROYED", cardId: card.cardId, reason: "effect" });
        events.push({
          type: "CARD_SENT_TO_GRAVEYARD",
          cardId: card.cardId,
          from: "board",
          sourceSeat: seat,
        });
      }
      break;
    }

    case "discard": {
      const count = cost.count ?? 1;
      const eligible = sourceCardId
        ? hand.filter((id) => id !== sourceCardId)
        : [...hand];
      const toDiscard = eligible.slice(0, count);

      events.push({ type: "COST_PAID", seat, costType: "discard", amount: count });
      for (const cardId of toDiscard) {
        events.push({
          type: "CARD_SENT_TO_GRAVEYARD",
          cardId,
          from: "hand",
          sourceSeat: seat,
        });
      }
      break;
    }

    case "pay_lp": {
      const amount = cost.amount ?? 0;
      events.push({ type: "COST_PAID", seat, costType: "pay_lp", amount });
      events.push({ type: "DAMAGE_DEALT", seat, amount, isBattle: false });
      break;
    }

    case "remove_vice": {
      const count = cost.count ?? 1;
      const target = board.find((c) => c.viceCounters >= count);
      if (target) {
        events.push({ type: "COST_PAID", seat, costType: "remove_vice", amount: count });
        events.push({
          type: "VICE_COUNTER_REMOVED",
          cardId: target.cardId,
          newCount: target.viceCounters - count,
        });
      }
      break;
    }

    case "banish": {
      const count = cost.count ?? 1;
      const toBanish = graveyard.slice(0, count);

      events.push({ type: "COST_PAID", seat, costType: "banish", amount: count });
      for (const cardId of toBanish) {
        events.push({
          type: "CARD_BANISHED",
          cardId,
          from: "graveyard",
          sourceSeat: seat,
        });
      }
      break;
    }
  }

  return events;
}

// ── Effect Resolution ────────────────────────────────────────────

/**
 * Resolve an array of EffectActions from an effect definition into EngineEvents.
 *
 * This wraps the lower-level executeAction calls and provides the
 * seat/target context needed for resolution.
 */
export function resolveEffectActions(
  state: GameState,
  seat: Seat,
  actions: EffectAction[],
  sourceCardId: string,
  targets: string[]
): EngineEvent[] {
  const events: EngineEvent[] = [];

  for (const action of actions) {
    const actionEvents = executeAction(state, action, seat, sourceCardId, targets);
    events.push(...actionEvents);
  }

  return events;
}

/**
 * Check whether an effect can be activated given OPT/HOPT constraints
 * and cost requirements.
 *
 * - If oncePerTurn and the effect's id is in state.optUsedThisTurn -> false
 * - If hardOncePerTurn and the effect's id is in state.hoptUsedEffects -> false
 * - If cost cannot be paid -> false
 * - Otherwise -> true
 *
 * When seat and sourceCardId are provided, cost validation is performed.
 * Without them (backward-compatible), only OPT/HOPT checks run.
 */
export function canActivateEffect(
  state: GameState,
  effectDef: EffectDefinition,
  seat?: Seat,
  sourceCardId?: string
): boolean {
  if (effectDef.oncePerTurn && state.optUsedThisTurn.includes(effectDef.id)) {
    return false;
  }
  if (effectDef.hardOncePerTurn && state.hoptUsedEffects.includes(effectDef.id)) {
    return false;
  }

  // Cost validation requires seat context
  if (effectDef.cost && seat !== undefined) {
    if (!canPayCost(state, effectDef.cost, seat, sourceCardId)) {
      return false;
    }
  }

  return true;
}

/**
 * Scan a list of events for matching trigger effects on board cards.
 *
 * Handles:
 * - MONSTER_SUMMONED / SPECIAL_SUMMONED -> fires on_summon effects
 * - FLIP_SUMMONED -> fires both flip and on_summon effects
 *
 * Returns an array of EFFECT_ACTIVATED events (and their resulting action events)
 * that should be processed by evolve().
 */
export function detectTriggerEffects(state: GameState, events: EngineEvent[]): EngineEvent[] {
  const triggeredEvents: EngineEvent[] = [];

  for (const event of events) {
    const isSummon = event.type === "MONSTER_SUMMONED" || event.type === "SPECIAL_SUMMONED";
    const isFlip = event.type === "FLIP_SUMMONED";

    if (!isSummon && !isFlip) continue;

    const { seat, cardId } = event;
    const cardDef = state.cardLookup[cardId];

    if (!cardDef?.effects) continue;

    for (let i = 0; i < cardDef.effects.length; i++) {
      const eff = expectDefined(
        cardDef.effects[i],
        `rules.effects.detectTriggerEffects missing effect at index ${i}`
      );

      // Match trigger type to event type
      const matchesTrigger =
        (isSummon && eff.type === "on_summon") ||
        (isFlip && (eff.type === "flip" || eff.type === "on_summon"));

      if (!matchesTrigger) continue;

      // Check OPT/HOPT constraints (no cost check for triggers — they fire automatically)
      if (!canActivateEffect(state, eff)) continue;

      // Emit EFFECT_ACTIVATED event
      triggeredEvents.push({
        type: "EFFECT_ACTIVATED",
        seat,
        cardId,
        effectIndex: i,
        targets: [],
      });

      // Resolve the effect's actions
      const actionEvents = resolveEffectActions(state, seat, eff.actions, cardId, []);
      triggeredEvents.push(...actionEvents);
    }
  }

  return triggeredEvents;
}
