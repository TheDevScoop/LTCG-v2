/**
 * effectParser.ts
 *
 * Maps raw CSV ability data (from cardData.ts) to engine EffectDefinition objects.
 *
 * CSV ability format:
 *   { trigger: string, speed: number|string, targets: string[], operations: string[] }
 *
 * Engine target:
 *   EffectDefinition { id, type, description, actions: EffectAction[], ... }
 */

import type { EffectDefinition, EffectAction, TargetFilter } from "./types/index.js";
import { expectDefined } from "./internal/invariant.js";

// ── CSV Ability Shape ──────────────────────────────────────────────

export interface CSVAbility {
  trigger: string;
  speed: number | string;
  targets: string[];
  operations: string[];
}

// ── Trigger → EffectDefinition.type ────────────────────────────────

const TRIGGER_MAP: Record<string, EffectDefinition["type"]> = {
  OnSummon: "on_summon",
  OnMainPhase: "ignition",
  OnSpellActivation: "trigger",
  OnSpellPlayed: "trigger",
  OnTrapActivation: "trigger",
  OnTrapActivated: "trigger",
  OnEffectActivation: "trigger",
  OnEnvironmentActivation: "trigger",
  OnSpellResolution: "trigger",
  OnAttackDeclaration: "trigger",
  OnOpponentAttackDeclaration: "trigger",
  OnOpponentStereotypeSummoned: "trigger",
  OnOpponentSpellActivation: "trigger",
  OnOpponentEffectResolution: "trigger",
  OnOpponentCardActivation: "trigger",
  OnOpponentSummon: "trigger",
  OnOpponentDrawPhaseStart: "trigger",
  OnOpponentReputationGain: "trigger",
  OnStabilityZero: "trigger",
  OnStabilityBelowThreshold: "trigger",
  OnDestroy: "trigger",
  OnCardDestroyed: "trigger",
  OnTurnStart: "continuous",
  OnDrawPhase: "trigger",
  OnBattlePhaseStart: "trigger",
  OnDeckEmpty: "trigger",
  OnGameStart: "continuous",
  OnSpellCountThree: "trigger",
  OnReputationGain: "trigger",
  OnTrapTargetingYou: "quick",
};

function mapTrigger(trigger: string, speed: number | string): EffectDefinition["type"] {
  // Explicit speed override
  if (speed === "ignition") return "ignition";
  if (speed === "quick" || speed === 2) return "quick";

  return TRIGGER_MAP[trigger] ?? "trigger";
}

// ── Target → TargetFilter ──────────────────────────────────────────

function mapTargets(targets: string[]): { targetFilter?: TargetFilter; targetCount?: number } {
  if (!targets || targets.length === 0) return {};

  const primary = targets[0];

  switch (primary) {
    case "self":
      return { targetFilter: { owner: "self" } };
    case "opponent":
      return { targetFilter: { owner: "opponent" } };
    case "bothPlayers":
    case "allPlayers":
      return { targetFilter: { owner: "any" } };
    case "alliedStereotypes":
      return { targetFilter: { owner: "self", cardType: "stereotype" } };
    case "allStereotypes":
      return { targetFilter: { owner: "any", cardType: "stereotype" } };
    case "attacker":
    case "opponentCard":
    case "targetCard":
    case "destroyedCard":
      return { targetFilter: { owner: "opponent" }, targetCount: 1 };
    case "field":
    case "environment":
    case "Environment":
      return { targetFilter: { zone: "board", owner: "any" } };
    case "spells":
    case "spell":
      return { targetFilter: { owner: "any", cardType: "spell" } };
    case "traps":
    case "trap":
      return { targetFilter: { owner: "any", cardType: "trap" } };
    // Archetype-specific targets
    case "Dropouts":
    case "Preps":
    case "Geeks":
    case "Geek":
    case "Freaks":
    case "Nerds":
    case "Nerd":
    case "Goodies":
      return { targetFilter: { owner: "self", cardType: "stereotype" } };
    default:
      return {};
  }
}

type ParserTarget = "self" | "opponent" | "both";

interface ParseContext {
  targets: string[];
  lastViewedTopCount?: number;
}

function inferOperationTarget(targets: string[], body: string): ParserTarget {
  const lowerBody = body.toLowerCase();
  if (lowerBody.includes("opponent")) return "opponent";
  if (lowerBody.includes("both") || lowerBody.includes("all players")) return "both";

  const normalizedTargets = targets.map((target) => target.toLowerCase());
  if (normalizedTargets.some((target) => target === "bothplayers" || target === "allplayers")) {
    return "both";
  }
  if (normalizedTargets.some((target) =>
    target === "opponent" ||
    target === "opponentcard" ||
    target === "attacker" ||
    target === "targetcard" ||
    target === "destroyedcard")
  ) {
    return "opponent";
  }

  return "self";
}

function parseDurationTurns(body: string): number {
  const lower = body.toLowerCase();
  if (lower.includes("next turn") || lower.includes("opponent next")) return 2;
  if (lower.includes("this turn")) return 1;
  const turnsMatch = lower.match(/(\d+)\s*turn/);
  if (turnsMatch) {
    return Math.max(
      1,
      parseInt(expectDefined(turnsMatch[1], "effectParser.parseDurationTurns missing turns capture"), 10),
    );
  }
  const bareNumber = lower.match(/(\d+)/);
  if (bareNumber) {
    return Math.max(
      1,
      parseInt(expectDefined(bareNumber[1], "effectParser.parseDurationTurns missing bare number capture"), 10),
    );
  }
  return 1;
}

// ── Operation Parsers ──────────────────────────────────────────────

/**
 * Parse a MODIFY_STAT operation string.
 * Variants:
 *   "MODIFY_STAT: reputation +300"
 *   "MODIFY_STAT: stability -200 to self"
 *   "MODIFY_STAT: reputation +200 per Dropout you control"
 *   "MODIFY_STAT: reputation *2"
 *   "MODIFY_STAT: reputation -X (equal to gained)"
 */
function parseModifyStat(op: string): EffectAction | undefined {
  const body = op.replace(/^(CONDITIONAL_)?MODIFY_STAT:\s*/, "").trim();

  // Determine stat type
  const isReputation = body.startsWith("reputation");
  const isStability = body.startsWith("stability");
  if (!isReputation && !isStability) return undefined;

  const rest = body.replace(/^(reputation|stability)\s*/, "").trim();

  // Extract sign and amount
  const numMatch = rest.match(/^([+\-*])(\d+)/);
  if (!numMatch) {
    // Variable amounts like "+200 per card in graveyard" or "-X (mirror)"
    // Use a default amount of 0 and store raw in description via meta
    const signMatch = rest.match(/^([+\-])/);
    const isPositive = !signMatch ||
      expectDefined(signMatch[1], "effectParser.parseModifyStat missing sign capture") === "+";

    if (isReputation) {
      return isPositive
        ? { type: "boost_attack", amount: 0, duration: "permanent" }
        : { type: "damage", amount: 0, target: "opponent" };
    }
    return isPositive
      ? { type: "boost_defense", amount: 0, duration: "permanent" }
      : { type: "damage", amount: 0, target: "opponent" };
  }

  const sign = expectDefined(numMatch[1], "effectParser.parseModifyStat missing operator capture");
  const amount = parseInt(
    expectDefined(numMatch[2], "effectParser.parseModifyStat missing amount capture"),
    10
  );

  // Determine target from "to self", "to opponent", "to all" etc.
  const hasToSelf = /to self/i.test(rest);
  const hasToOpponent = /to opponent/i.test(rest);

  if (sign === "*") {
    // Multiplication — boost_attack with the multiplied amount
    return isReputation
      ? { type: "boost_attack", amount, duration: "permanent" }
      : { type: "boost_defense", amount, duration: "permanent" };
  }

  if (sign === "+") {
    if (isReputation) {
      if (hasToOpponent) {
        // Giving reputation to opponent = heal opponent (not in engine), treat as boost
        return { type: "boost_attack", amount, duration: "permanent" };
      }
      return { type: "boost_attack", amount, duration: "permanent" };
    }
    // stability +
    if (hasToOpponent) {
      return { type: "boost_defense", amount, duration: "permanent" };
    }
    return { type: "boost_defense", amount, duration: "permanent" };
  }

  // sign === "-"
  if (isReputation) {
    if (hasToSelf) {
      // Self damage = negative boost
      return { type: "damage", amount, target: "opponent" };
    }
    return { type: "damage", amount, target: "opponent" };
  }
  // stability -
  return { type: "damage", amount, target: "opponent" };
}

/**
 * Parse a DRAW operation.
 * Variants: "DRAW: 2", "DRAW: number of Geeks you control", "DRAW: 1 for both"
 */
function parseDraw(op: string): EffectAction | undefined {
  const body = op.replace(/^(CONDITIONAL_)?DRAW:\s*/, "").trim();
  const numMatch = body.match(/^(\d+)/);
  const count = numMatch
    ? parseInt(expectDefined(numMatch[1], "effectParser.parseDraw missing draw count capture"), 10)
    : 1;
  return { type: "draw", count };
}

/**
 * Parse a DISCARD operation.
 * Variants: "DISCARD: 2", "DISCARD: 1 from opponent", "DISCARD: 1 random", "DISCARD: all"
 */
function parseDiscard(op: string): EffectAction | undefined {
  const body = op.replace(/^DISCARD:\s*/, "").trim();
  if (body === "all" || body === "all from both hands") {
    return { type: "discard", count: 99, target: "opponent" };
  }
  const numMatch = body.match(/^(\d+)/);
  const count = numMatch
    ? parseInt(expectDefined(numMatch[1], "effectParser.parseDiscard missing discard count capture"), 10)
    : 1;
  return { type: "discard", count, target: "opponent" };
}

/**
 * Parse a DESTROY operation.
 * Variants: "DESTROY: 1", "DESTROY: all traps", "DESTROY: alliedStereotypes"
 */
function parseDestroy(op: string): EffectAction | undefined {
  const body = op.replace(/^DESTROY:\s*/, "").trim();

  if (body.includes("all traps") || body.includes("all spells")) {
    return { type: "destroy", target: "all_spells_traps" };
  }
  if (body === "alliedStereotypes") {
    return { type: "destroy", target: "all_opponent_monsters" };
  }
  // Default: targeted destroy
  return { type: "destroy", target: "selected" };
}

/**
 * Parse a NEGATE operation.
 */
function parseNegate(_op: string): EffectAction {
  return { type: "negate", target: "last_chain_link" };
}

/**
 * Parse a MOVE_TO_ZONE operation.
 * Variants:
 *   "MOVE_TO_ZONE: destroyedCard to hand"
 *   "MOVE_TO_ZONE: graveyard to deck"
 *   "MOVE_TO_ZONE: selected card from graveyard to hand"
 */
function parseMoveToZone(op: string): EffectAction | undefined {
  const body = op.replace(/^MOVE_TO_ZONE:\s*/, "").trim();

  if (body.includes("to hand")) {
    if (body.includes("graveyard") || body.includes("destroyedCard")) {
      return { type: "return_to_hand", target: "selected" };
    }
    return { type: "return_to_hand", target: "selected" };
  }
  if (body.includes("to deck")) {
    // Return to deck = banish equivalent (remove from current zone)
    return { type: "banish", target: "selected" };
  }

  return { type: "return_to_hand", target: "selected" };
}

/**
 * Parse a GRANT_IMMUNITY operation → maps to boost_defense (temporary shield).
 */
function parseGrantImmunity(_op: string): EffectAction {
  // Immunity = large defensive boost for the turn
  return { type: "boost_defense", amount: 9999, duration: "turn" };
}

/**
 * Parse RANDOM_GAIN → damage to opponent (coin flip mechanic).
 */
function parseRandomGain(op: string): EffectAction | undefined {
  const numMatch = op.match(/\+(\d+)/);
  const amount = numMatch
    ? parseInt(expectDefined(numMatch[1], "effectParser.parseRandomGain missing amount capture"), 10)
    : 500;
  return { type: "damage", amount, target: "opponent" };
}

/**
 * Parse FORCE_ATTACK / CHANGE_ATTACK_TARGET → change_position.
 */
function parseForce(_op: string): EffectAction {
  return { type: "change_position", target: "selected" };
}

/**
 * Parse MODIFY_COST operations.
 * Variants:
 *   "MODIFY_COST: spells to 0"
 *   "MODIFY_COST: traps x2"
 *   "MODIFY_COST: spells -1"
 *   "MODIFY_COST: spells +1"
 */
function parseModifyCost(op: string, context: ParseContext): EffectAction {
  const body = op.replace(/^MODIFY_COST:\s*/, "").trim();
  const lower = body.toLowerCase();

  const cardType: "spell" | "trap" | "all" = lower.includes("trap")
    ? "trap"
    : lower.includes("spell")
      ? "spell"
      : "all";

  let operation: "set" | "add" | "multiply" = "add";
  let amount = 0;

  const setMatch = lower.match(/to\s*(-?\d+)/);
  if (setMatch) {
    operation = "set";
    amount = parseInt(expectDefined(setMatch[1], "effectParser.parseModifyCost missing set amount"), 10);
  } else {
    const multMatch = lower.match(/x\s*(-?\d+)/);
    if (multMatch) {
      operation = "multiply";
      amount = parseInt(
        expectDefined(multMatch[1], "effectParser.parseModifyCost missing multiplier"),
        10,
      );
    } else {
      const addMatch = lower.match(/([+\-]\d+)/);
      if (addMatch) {
        operation = "add";
        amount = parseInt(expectDefined(addMatch[1], "effectParser.parseModifyCost missing delta"), 10);
      } else {
        const reduceMatch = lower.match(/(?:reduce|decrease)\s+by\s+(\d+)/);
        if (reduceMatch) {
          operation = "add";
          amount = -parseInt(
            expectDefined(reduceMatch[1], "effectParser.parseModifyCost missing reduce amount"),
            10,
          );
        } else {
          const increaseMatch = lower.match(/increase\s+by\s+(\d+)/);
          if (increaseMatch) {
            operation = "add";
            amount = parseInt(
              expectDefined(increaseMatch[1], "effectParser.parseModifyCost missing increase amount"),
              10,
            );
          }
        }
      }
    }
  }

  return {
    type: "modify_cost",
    cardType,
    operation,
    amount,
    target: context.targets.some((target) => {
      const lower = target.toLowerCase();
      return lower === "spells" || lower === "spell" || lower === "traps" || lower === "trap";
    })
      ? "both"
      : inferOperationTarget(context.targets, body),
    durationTurns: parseDurationTurns(body),
  };
}

/**
 * Parse VIEW_TOP_CARDS.
 */
function parseViewTopCards(op: string): EffectAction {
  const body = op.replace(/^VIEW_TOP_CARDS:\s*/, "").trim();
  const match = body.match(/(\d+)/);
  const count = match
    ? parseInt(expectDefined(match[1], "effectParser.parseViewTopCards missing count"), 10)
    : 3;
  return { type: "view_top_cards", count: Math.max(1, count) };
}

/**
 * Parse REARRANGE_CARDS into a deterministic reorder strategy.
 */
function parseRearrangeCards(context: ParseContext): EffectAction {
  return {
    type: "rearrange_top_cards",
    count: Math.max(1, context.lastViewedTopCount ?? 3),
    strategy: "reverse",
  };
}

/**
 * Parse DISABLE/SKIP operations into turn restrictions.
 */
function parseDisable(op: string, context: ParseContext): EffectAction | undefined {
  const body = op
    .replace(/^SKIP_NEXT_BATTLE_PHASE:?/i, "DISABLE_BATTLE_PHASE:")
    .replace(/^(SKIP_|DISABLE_)/, "")
    .trim();
  const upper = op.toUpperCase();

  let restriction: "disable_attacks" | "disable_battle_phase" | "disable_draw_phase" | "disable_effects";

  if (upper.startsWith("DISABLE_ATTACKS")) {
    restriction = "disable_attacks";
  } else if (
    upper.startsWith("DISABLE_BATTLE_PHASE") ||
    upper.startsWith("SKIP_BATTLE_PHASE") ||
    upper.startsWith("SKIP_NEXT_BATTLE_PHASE")
  ) {
    restriction = "disable_battle_phase";
  } else if (
    upper.startsWith("DISABLE_DRAW_PHASE") ||
    upper.startsWith("SKIP_DRAW_PHASE") ||
    upper.startsWith("SKIP_NEXT_DRAW_PHASE")
  ) {
    restriction = "disable_draw_phase";
  } else if (upper.startsWith("DISABLE_EFFECT")) {
    restriction = "disable_effects";
  } else {
    return undefined;
  }

  return {
    type: "apply_restriction",
    restriction,
    target: inferOperationTarget(context.targets, body),
    durationTurns: (
      upper.startsWith("SKIP_NEXT_BATTLE_PHASE") ||
      upper.startsWith("SKIP_NEXT_DRAW_PHASE")
    )
      ? 2
      : parseDurationTurns(body),
  };
}

/**
 * Parse SET_STAT → heal.
 */
function parseSetStat(op: string): EffectAction {
  const numMatch = op.match(/(\d+)/);
  const amount = numMatch
    ? parseInt(expectDefined(numMatch[1], "effectParser.parseSetStat missing amount capture"), 10)
    : 1000;
  return { type: "heal", amount, target: "self" };
}

/**
 * Parse RANDOM_CARD → draw.
 */
function parseRandomCard(_op: string): EffectAction {
  return { type: "draw", count: 1 };
}

/**
 * Parse STEAL → special_summon from opponent's board.
 */
function parseSteal(_op: string): EffectAction {
  return { type: "special_summon", from: "hand" };
}

/**
 * Parse COPY_LAST_SPELL_EFFECT → treat as draw (card advantage).
 */
function parseCopy(_op: string): EffectAction {
  return { type: "draw", count: 1 };
}

/**
 * Parse REDUCE_DAMAGE → boost_defense.
 */
function parseReduceDamage(op: string): EffectAction {
  const pctMatch = op.match(/(\d+)%/);
  const pct = pctMatch
    ? parseInt(expectDefined(pctMatch[1], "effectParser.parseReduceDamage missing percent capture"), 10)
    : 50;
  return { type: "boost_defense", amount: pct * 10, duration: "turn" };
}

/**
 * Parse REMOVE_COUNTERS → remove_vice.
 */
function parseRemoveCounters(_op: string): EffectAction {
  return { type: "remove_vice", count: 1, target: "selected" };
}

// ── Main Operation Dispatcher ──────────────────────────────────────

function parseOperation(op: string, context: ParseContext): EffectAction | undefined {
  const trimmed = op.trim();

  if (trimmed.startsWith("MODIFY_STAT:") || trimmed.startsWith("CONDITIONAL_MODIFY_STAT:")) {
    return parseModifyStat(trimmed);
  }
  if (trimmed.startsWith("RANDOM_MODIFY_STAT:")) {
    return parseModifyStat(trimmed.replace("RANDOM_MODIFY_STAT:", "MODIFY_STAT:"));
  }
  if (trimmed.startsWith("DRAW:") || trimmed.startsWith("CONDITIONAL_DRAW:")) {
    return parseDraw(trimmed);
  }
  if (trimmed.startsWith("DISCARD:")) {
    return parseDiscard(trimmed);
  }
  if (trimmed.startsWith("DESTROY:")) {
    return parseDestroy(trimmed);
  }
  if (trimmed.startsWith("NEGATE") || trimmed === "RANDOM_NEGATE") {
    return parseNegate(trimmed);
  }
  if (trimmed.startsWith("MOVE_TO_ZONE:")) {
    return parseMoveToZone(trimmed);
  }
  if (trimmed.startsWith("GRANT_IMMUNITY:")) {
    return parseGrantImmunity(trimmed);
  }
  if (trimmed.startsWith("RANDOM_GAIN:")) {
    return parseRandomGain(trimmed);
  }
  if (trimmed.startsWith("FORCE_ATTACK") || trimmed === "CHANGE_ATTACK_TARGET" || trimmed.startsWith("FORCE_TARGET:")) {
    return parseForce(trimmed);
  }
  if (trimmed.startsWith("SKIP_") || trimmed.startsWith("DISABLE_")) {
    return parseDisable(trimmed, context);
  }
  if (trimmed.startsWith("SET_STAT:")) {
    return parseSetStat(trimmed);
  }
  if (trimmed.startsWith("RANDOM_CARD:")) {
    return parseRandomCard(trimmed);
  }
  if (trimmed.startsWith("STEAL:")) {
    return parseSteal(trimmed);
  }
  if (trimmed.startsWith("COPY_LAST_SPELL_EFFECT")) {
    return parseCopy(trimmed);
  }
  if (trimmed.startsWith("REDUCE_DAMAGE:")) {
    return parseReduceDamage(trimmed);
  }
  if (trimmed.startsWith("REMOVE_COUNTERS:")) {
    return parseRemoveCounters(trimmed);
  }
  if (trimmed.startsWith("MODIFY_COST:")) {
    return parseModifyCost(trimmed, context);
  }
  if (trimmed.startsWith("VIEW_TOP_CARDS:")) {
    return parseViewTopCards(trimmed);
  }
  if (trimmed === "REARRANGE_CARDS") {
    return parseRearrangeCards(context);
  }
  if (trimmed.startsWith("REVEAL_HAND") || trimmed === "SHUFFLE" ||
      trimmed === "ACTIVATE_TRAPS_TWICE" || trimmed === "REVERSE_EFFECT") {
    // Information/meta operations — no engine action equivalent
    return undefined;
  }

  // Unknown operation — skip silently
  return undefined;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Parse a single CSV ability object into an engine EffectDefinition.
 */
export function parseCSVAbility(ability: CSVAbility, index: number): EffectDefinition {
  const effectType = mapTrigger(ability.trigger, ability.speed);
  const { targetFilter, targetCount } = mapTargets(ability.targets);

  const actions: EffectAction[] = [];
  const context: ParseContext = {
    targets: ability.targets,
  };
  for (const op of ability.operations) {
    const action = parseOperation(op, context);
    if (action) {
      actions.push(action);
      if (action.type === "view_top_cards") {
        context.lastViewedTopCount = action.count;
      }
    }
  }

  return {
    id: `eff_${index}`,
    type: effectType,
    description: ability.operations.join("; "),
    actions,
    targetFilter,
    targetCount,
    oncePerTurn: ability.trigger === "OnMainPhase" || ability.trigger === "OnSummon",
  };
}

/**
 * Parse an array of CSV abilities (the `ability` field from a Convex card row)
 * into engine EffectDefinition[].
 *
 * Returns undefined if input is null/undefined/empty or produces no valid effects.
 */
export function parseCSVAbilities(abilities: unknown): EffectDefinition[] | undefined {
  if (!abilities || !Array.isArray(abilities) || abilities.length === 0) {
    return undefined;
  }

  const results: EffectDefinition[] = [];
  for (let i = 0; i < abilities.length; i++) {
    const raw = abilities[i] as CSVAbility;
    if (!raw || !raw.trigger || !raw.operations) continue;

    const def = parseCSVAbility(raw, i);
    // Only include if we parsed at least one action
    if (def.actions.length > 0) {
      results.push(def);
    }
  }

  return results.length > 0 ? results : undefined;
}
