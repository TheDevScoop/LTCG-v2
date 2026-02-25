/**
 * effectParser.test.ts
 *
 * Comprehensive tests for the effectParser module, which maps raw CSV card
 * ability data to engine EffectDefinition objects.
 */

import { describe, it, expect } from "vitest";
import { parseCSVAbility, parseCSVAbilities } from "../effectParser.js";
import type { CSVAbility } from "../effectParser.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAbility(
  overrides: Partial<CSVAbility> & { operations: string[] }
): CSVAbility {
  return {
    trigger: "OnMainPhase",
    speed: 1,
    targets: ["self"],
    ...overrides,
  };
}

// ── mapTrigger (via parseCSVAbility) ─────────────────────────────────────────

describe("mapTrigger", () => {
  it("maps OnSummon to on_summon", () => {
    const ability = makeAbility({ trigger: "OnSummon", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("on_summon");
  });

  it("maps OnMainPhase to ignition", () => {
    const ability = makeAbility({ trigger: "OnMainPhase", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("ignition");
  });

  it("maps OnSpellActivation to trigger", () => {
    const ability = makeAbility({ trigger: "OnSpellActivation", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("trigger");
  });

  it("maps OnSpellPlayed to trigger", () => {
    const ability = makeAbility({ trigger: "OnSpellPlayed", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("trigger");
  });

  it("maps OnTrapTargetingYou to quick", () => {
    const ability = makeAbility({ trigger: "OnTrapTargetingYou", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("quick");
  });

  it("maps OnTurnStart to continuous", () => {
    const ability = makeAbility({ trigger: "OnTurnStart", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("continuous");
  });

  it("maps OnGameStart to continuous", () => {
    const ability = makeAbility({ trigger: "OnGameStart", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("continuous");
  });

  it("maps OnTrapActivation to trigger", () => {
    const ability = makeAbility({ trigger: "OnTrapActivation", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("trigger");
  });

  it("maps OnAttackDeclaration to trigger", () => {
    const ability = makeAbility({ trigger: "OnAttackDeclaration", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("trigger");
  });

  it("maps OnDestroy to trigger", () => {
    const ability = makeAbility({ trigger: "OnDestroy", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("trigger");
  });

  it("maps unknown trigger to trigger (default fallback)", () => {
    const ability = makeAbility({ trigger: "OnSomethingWeird", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("trigger");
  });

  it("speed='ignition' overrides trigger mapping", () => {
    const ability = makeAbility({
      trigger: "OnTurnStart",
      speed: "ignition",
      operations: ["DRAW: 1"],
    });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("ignition");
  });

  it("speed='quick' overrides trigger mapping", () => {
    const ability = makeAbility({
      trigger: "OnSummon",
      speed: "quick",
      operations: ["DRAW: 1"],
    });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("quick");
  });

  it("speed=2 overrides trigger mapping to quick", () => {
    const ability = makeAbility({
      trigger: "OnTurnStart",
      speed: 2,
      operations: ["DRAW: 1"],
    });
    const def = parseCSVAbility(ability, 0);
    expect(def.type).toBe("quick");
  });

  it("numeric speed other than 2 does not override trigger", () => {
    const ability = makeAbility({
      trigger: "OnTurnStart",
      speed: 1,
      operations: ["DRAW: 1"],
    });
    const def = parseCSVAbility(ability, 0);
    // Should stay as the trigger-map value, not quick
    expect(def.type).toBe("continuous");
  });
});

// ── oncePerTurn flag ──────────────────────────────────────────────────────────

describe("oncePerTurn", () => {
  it("sets oncePerTurn=true for OnMainPhase trigger", () => {
    const ability = makeAbility({ trigger: "OnMainPhase", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.oncePerTurn).toBe(true);
  });

  it("sets oncePerTurn=true for OnSummon trigger", () => {
    const ability = makeAbility({ trigger: "OnSummon", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.oncePerTurn).toBe(true);
  });

  it("sets oncePerTurn=false for OnTrapTargetingYou trigger", () => {
    const ability = makeAbility({ trigger: "OnTrapTargetingYou", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.oncePerTurn).toBe(false);
  });

  it("sets oncePerTurn=false for OnTurnStart trigger", () => {
    const ability = makeAbility({ trigger: "OnTurnStart", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.oncePerTurn).toBe(false);
  });

  it("sets oncePerTurn=false for trigger-type effects", () => {
    const ability = makeAbility({ trigger: "OnDestroy", operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.oncePerTurn).toBe(false);
  });
});

// ── mapTargets (via parseCSVAbility) ─────────────────────────────────────────

describe("mapTargets", () => {
  it("maps 'self' to { owner: 'self' }", () => {
    const ability = makeAbility({ targets: ["self"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "self" });
    expect(def.targetCount).toBeUndefined();
  });

  it("maps 'opponent' to { owner: 'opponent' }", () => {
    const ability = makeAbility({ targets: ["opponent"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "opponent" });
    expect(def.targetCount).toBeUndefined();
  });

  it("maps 'bothPlayers' to { owner: 'any' }", () => {
    const ability = makeAbility({ targets: ["bothPlayers"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "any" });
  });

  it("maps 'allPlayers' to { owner: 'any' }", () => {
    const ability = makeAbility({ targets: ["allPlayers"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "any" });
  });

  it("maps 'alliedStereotypes' to { owner: 'self', cardType: 'stereotype' }", () => {
    const ability = makeAbility({ targets: ["alliedStereotypes"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "self", cardType: "stereotype" });
    expect(def.targetCount).toBeUndefined();
  });

  it("maps 'allStereotypes' to { owner: 'any', cardType: 'stereotype' }", () => {
    const ability = makeAbility({ targets: ["allStereotypes"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "any", cardType: "stereotype" });
  });

  it("maps 'attacker' to { owner: 'opponent' } with targetCount: 1", () => {
    const ability = makeAbility({ targets: ["attacker"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "opponent" });
    expect(def.targetCount).toBe(1);
  });

  it("maps 'opponentCard' to { owner: 'opponent' } with targetCount: 1", () => {
    const ability = makeAbility({ targets: ["opponentCard"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "opponent" });
    expect(def.targetCount).toBe(1);
  });

  it("maps 'targetCard' to { owner: 'opponent' } with targetCount: 1", () => {
    const ability = makeAbility({ targets: ["targetCard"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "opponent" });
    expect(def.targetCount).toBe(1);
  });

  it("maps 'destroyedCard' to { owner: 'opponent' } with targetCount: 1", () => {
    const ability = makeAbility({ targets: ["destroyedCard"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "opponent" });
    expect(def.targetCount).toBe(1);
  });

  it("maps 'field' to { zone: 'board', owner: 'any' }", () => {
    const ability = makeAbility({ targets: ["field"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ zone: "board", owner: "any" });
  });

  it("maps 'environment' to { zone: 'board', owner: 'any' }", () => {
    const ability = makeAbility({ targets: ["environment"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ zone: "board", owner: "any" });
  });

  it("maps 'Environment' (capital E) to { zone: 'board', owner: 'any' }", () => {
    const ability = makeAbility({ targets: ["Environment"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ zone: "board", owner: "any" });
  });

  it("maps 'spells' to { owner: 'any', cardType: 'spell' }", () => {
    const ability = makeAbility({ targets: ["spells"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "any", cardType: "spell" });
  });

  it("maps 'traps' to { owner: 'any', cardType: 'trap' }", () => {
    const ability = makeAbility({ targets: ["traps"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "any", cardType: "trap" });
  });

  it("maps archetype 'Dropouts' to { owner: 'self', cardType: 'stereotype' }", () => {
    const ability = makeAbility({ targets: ["Dropouts"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "self", cardType: "stereotype" });
  });

  it("maps archetype 'Geeks' to { owner: 'self', cardType: 'stereotype' }", () => {
    const ability = makeAbility({ targets: ["Geeks"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "self", cardType: "stereotype" });
  });

  it("maps archetype 'Geek' (singular) to { owner: 'self', cardType: 'stereotype' }", () => {
    const ability = makeAbility({ targets: ["Geek"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "self", cardType: "stereotype" });
  });

  it("maps archetype 'Nerd' (singular) to { owner: 'self', cardType: 'stereotype' }", () => {
    const ability = makeAbility({ targets: ["Nerd"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "self", cardType: "stereotype" });
  });

  it("maps archetype 'Nerds' to { owner: 'self', cardType: 'stereotype' }", () => {
    const ability = makeAbility({ targets: ["Nerds"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "self", cardType: "stereotype" });
  });

  it("maps archetype 'Preps' to { owner: 'self', cardType: 'stereotype' }", () => {
    const ability = makeAbility({ targets: ["Preps"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "self", cardType: "stereotype" });
  });

  it("maps archetype 'Freaks' to { owner: 'self', cardType: 'stereotype' }", () => {
    const ability = makeAbility({ targets: ["Freaks"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "self", cardType: "stereotype" });
  });

  it("maps archetype 'Goodies' to { owner: 'self', cardType: 'stereotype' }", () => {
    const ability = makeAbility({ targets: ["Goodies"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toEqual({ owner: "self", cardType: "stereotype" });
  });

  it("maps unknown target to {} (no targetFilter)", () => {
    const ability = makeAbility({ targets: ["randomUnknown"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toBeUndefined();
    expect(def.targetCount).toBeUndefined();
  });

  it("maps empty targets array to {} (no targetFilter)", () => {
    const ability = makeAbility({ targets: [], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.targetFilter).toBeUndefined();
    expect(def.targetCount).toBeUndefined();
  });

  it("uses only the first target when multiple are provided", () => {
    const ability = makeAbility({ targets: ["self", "opponent"], operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    // First target is "self"
    expect(def.targetFilter).toEqual({ owner: "self" });
  });
});

// ── MODIFY_STAT operations ────────────────────────────────────────────────────

describe("parseOperation: MODIFY_STAT", () => {
  it("reputation +300 → boost_attack 300 permanent", () => {
    const ability = makeAbility({ operations: ["MODIFY_STAT: reputation +300"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(1);
    expect(def.actions[0]).toEqual({ type: "boost_attack", amount: 300, duration: "permanent" });
  });

  it("stability +200 → boost_defense 200 permanent", () => {
    const ability = makeAbility({ operations: ["MODIFY_STAT: stability +200"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_defense", amount: 200, duration: "permanent" });
  });

  it("reputation -200 → damage 200 opponent", () => {
    const ability = makeAbility({ operations: ["MODIFY_STAT: stability -200"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "damage", amount: 200, target: "opponent" });
  });

  it("stability -500 → damage 500 opponent", () => {
    const ability = makeAbility({ operations: ["MODIFY_STAT: reputation -500"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "damage", amount: 500, target: "opponent" });
  });

  it("reputation *2 → boost_attack multiplication amount", () => {
    const ability = makeAbility({ operations: ["MODIFY_STAT: reputation *2"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_attack", amount: 2, duration: "permanent" });
  });

  it("stability *3 → boost_defense multiplication amount", () => {
    const ability = makeAbility({ operations: ["MODIFY_STAT: stability *3"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_defense", amount: 3, duration: "permanent" });
  });

  it("CONDITIONAL_MODIFY_STAT: reputation +100 → same as MODIFY_STAT", () => {
    const ability = makeAbility({ operations: ["CONDITIONAL_MODIFY_STAT: reputation +100"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_attack", amount: 100, duration: "permanent" });
  });

  it("variable amount '+equal to graveyard count' → amount: 0 boost_attack", () => {
    // No leading digit after the sign — falls into the variable-amount branch
    const ability = makeAbility({ operations: ["MODIFY_STAT: reputation +equal to graveyard count"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_attack", amount: 0, duration: "permanent" });
  });

  it("variable amount '-X (mirror)' → amount: 0 damage", () => {
    const ability = makeAbility({ operations: ["MODIFY_STAT: reputation -X (mirror)"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "damage", amount: 0, target: "opponent" });
  });

  it("variable amount with stability positive → amount: 0 boost_defense", () => {
    const ability = makeAbility({ operations: ["MODIFY_STAT: stability +equal to graveyard"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_defense", amount: 0, duration: "permanent" });
  });

  it("MODIFY_STAT with 'to opponent' on reputation+ → boost_attack", () => {
    const ability = makeAbility({ operations: ["MODIFY_STAT: reputation +400 to opponent"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_attack", amount: 400, duration: "permanent" });
  });

  it("MODIFY_STAT with 'to self' on reputation- → damage", () => {
    const ability = makeAbility({ operations: ["MODIFY_STAT: reputation -300 to self"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "damage", amount: 300, target: "opponent" });
  });

  it("RANDOM_MODIFY_STAT is treated the same as MODIFY_STAT", () => {
    const ability = makeAbility({ operations: ["RANDOM_MODIFY_STAT: reputation +200"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_attack", amount: 200, duration: "permanent" });
  });

  it("unknown stat name → produces no action (undefined)", () => {
    const ability = makeAbility({ operations: ["MODIFY_STAT: coolness +300"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(0);
  });
});

// ── DRAW operations ───────────────────────────────────────────────────────────

describe("parseOperation: DRAW", () => {
  it("DRAW: 2 → { type: 'draw', count: 2 }", () => {
    const ability = makeAbility({ operations: ["DRAW: 2"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "draw", count: 2 });
  });

  it("DRAW: 1 → { type: 'draw', count: 1 }", () => {
    const ability = makeAbility({ operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "draw", count: 1 });
  });

  it("CONDITIONAL_DRAW: 1 → { type: 'draw', count: 1 }", () => {
    const ability = makeAbility({ operations: ["CONDITIONAL_DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "draw", count: 1 });
  });

  it("DRAW with no number defaults to count: 1", () => {
    const ability = makeAbility({ operations: ["DRAW: number of Geeks you control"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "draw", count: 1 });
  });

  it("DRAW: 3 → { type: 'draw', count: 3 }", () => {
    const ability = makeAbility({ operations: ["DRAW: 3"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "draw", count: 3 });
  });

  it("DRAW with descriptive text after number uses the number", () => {
    const ability = makeAbility({ operations: ["DRAW: 2 for both players"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "draw", count: 2 });
  });
});

// ── DISCARD operations ────────────────────────────────────────────────────────

describe("parseOperation: DISCARD", () => {
  it("DISCARD: 2 → { type: 'discard', count: 2, target: 'opponent' }", () => {
    const ability = makeAbility({ operations: ["DISCARD: 2"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "discard", count: 2, target: "opponent" });
  });

  it("DISCARD: 1 → { type: 'discard', count: 1, target: 'opponent' }", () => {
    const ability = makeAbility({ operations: ["DISCARD: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "discard", count: 1, target: "opponent" });
  });

  it("DISCARD: all → count: 99", () => {
    const ability = makeAbility({ operations: ["DISCARD: all"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "discard", count: 99, target: "opponent" });
  });

  it("DISCARD: all from both hands → count: 99", () => {
    const ability = makeAbility({ operations: ["DISCARD: all from both hands"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "discard", count: 99, target: "opponent" });
  });

  it("DISCARD with no number defaults to count: 1", () => {
    const ability = makeAbility({ operations: ["DISCARD: random card"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "discard", count: 1, target: "opponent" });
  });

  it("DISCARD: 1 random → count: 1", () => {
    const ability = makeAbility({ operations: ["DISCARD: 1 random"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "discard", count: 1, target: "opponent" });
  });
});

// ── DESTROY operations ────────────────────────────────────────────────────────

describe("parseOperation: DESTROY", () => {
  it("DESTROY: all traps → target: 'all_spells_traps'", () => {
    const ability = makeAbility({ operations: ["DESTROY: all traps"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "destroy", target: "all_spells_traps" });
  });

  it("DESTROY: all spells → target: 'all_spells_traps'", () => {
    const ability = makeAbility({ operations: ["DESTROY: all spells"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "destroy", target: "all_spells_traps" });
  });

  it("DESTROY: alliedStereotypes → target: 'all_opponent_monsters'", () => {
    const ability = makeAbility({ operations: ["DESTROY: alliedStereotypes"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "destroy", target: "all_opponent_monsters" });
  });

  it("DESTROY: 1 → target: 'selected'", () => {
    const ability = makeAbility({ operations: ["DESTROY: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "destroy", target: "selected" });
  });

  it("DESTROY: opponentCard → target: 'selected' (default)", () => {
    const ability = makeAbility({ operations: ["DESTROY: opponentCard"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "destroy", target: "selected" });
  });

  it("DESTROY with no special keyword → target: 'selected' (default)", () => {
    const ability = makeAbility({ operations: ["DESTROY: target monster"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "destroy", target: "selected" });
  });
});

// ── NEGATE operations ─────────────────────────────────────────────────────────

describe("parseOperation: NEGATE", () => {
  it("NEGATE → { type: 'negate', target: 'last_chain_link' }", () => {
    const ability = makeAbility({ operations: ["NEGATE"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "negate", target: "last_chain_link" });
  });

  it("NEGATE: effect → { type: 'negate', target: 'last_chain_link' }", () => {
    const ability = makeAbility({ operations: ["NEGATE: effect"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "negate", target: "last_chain_link" });
  });

  it("RANDOM_NEGATE → { type: 'negate', target: 'last_chain_link' }", () => {
    const ability = makeAbility({ operations: ["RANDOM_NEGATE"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "negate", target: "last_chain_link" });
  });
});

// ── MOVE_TO_ZONE operations ───────────────────────────────────────────────────

describe("parseOperation: MOVE_TO_ZONE", () => {
  it("'to hand' variant → return_to_hand selected", () => {
    const ability = makeAbility({ operations: ["MOVE_TO_ZONE: destroyedCard to hand"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "return_to_hand", target: "selected" });
  });

  it("'graveyard to hand' → return_to_hand selected", () => {
    const ability = makeAbility({ operations: ["MOVE_TO_ZONE: graveyard to hand"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "return_to_hand", target: "selected" });
  });

  it("'selected card from graveyard to hand' → return_to_hand selected", () => {
    const ability = makeAbility({
      operations: ["MOVE_TO_ZONE: selected card from graveyard to hand"],
    });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "return_to_hand", target: "selected" });
  });

  it("'to deck' variant → banish selected", () => {
    const ability = makeAbility({ operations: ["MOVE_TO_ZONE: graveyard to deck"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "banish", target: "selected" });
  });

  it("no 'to hand' or 'to deck' → return_to_hand selected (fallback)", () => {
    const ability = makeAbility({ operations: ["MOVE_TO_ZONE: card to board"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "return_to_hand", target: "selected" });
  });
});

// ── GRANT_IMMUNITY operations ─────────────────────────────────────────────────

describe("parseOperation: GRANT_IMMUNITY", () => {
  it("GRANT_IMMUNITY: this turn → boost_defense 9999 turn", () => {
    const ability = makeAbility({ operations: ["GRANT_IMMUNITY: this turn"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_defense", amount: 9999, duration: "turn" });
  });

  it("GRANT_IMMUNITY: targeting → boost_defense 9999 turn", () => {
    const ability = makeAbility({ operations: ["GRANT_IMMUNITY: targeting"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_defense", amount: 9999, duration: "turn" });
  });
});

// ── RANDOM_GAIN operations ────────────────────────────────────────────────────

describe("parseOperation: RANDOM_GAIN", () => {
  it("RANDOM_GAIN: +500 → damage 500 opponent", () => {
    const ability = makeAbility({ operations: ["RANDOM_GAIN: +500"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "damage", amount: 500, target: "opponent" });
  });

  it("RANDOM_GAIN: +1000 → damage 1000 opponent", () => {
    const ability = makeAbility({ operations: ["RANDOM_GAIN: +1000"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "damage", amount: 1000, target: "opponent" });
  });

  it("RANDOM_GAIN with no amount → damage 500 (default)", () => {
    const ability = makeAbility({ operations: ["RANDOM_GAIN: random"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "damage", amount: 500, target: "opponent" });
  });
});

// ── FORCE_ATTACK / CHANGE_ATTACK_TARGET operations ───────────────────────────

describe("parseOperation: FORCE_ATTACK / CHANGE_ATTACK_TARGET", () => {
  it("FORCE_ATTACK → change_position selected", () => {
    const ability = makeAbility({ operations: ["FORCE_ATTACK"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "change_position", target: "selected" });
  });

  it("FORCE_ATTACK: specific target → change_position selected", () => {
    const ability = makeAbility({ operations: ["FORCE_ATTACK: weakest"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "change_position", target: "selected" });
  });

  it("CHANGE_ATTACK_TARGET → change_position selected", () => {
    const ability = makeAbility({ operations: ["CHANGE_ATTACK_TARGET"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "change_position", target: "selected" });
  });

  it("FORCE_TARGET: → change_position selected", () => {
    const ability = makeAbility({ operations: ["FORCE_TARGET: opponent"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "change_position", target: "selected" });
  });
});

// ── SKIP_ / DISABLE_ operations ──────────────────────────────────────────────

describe("parseOperation: SKIP_ / DISABLE_", () => {
  it("SKIP_DRAW_PHASE → apply_restriction disable_draw_phase", () => {
    const ability = makeAbility({ operations: ["SKIP_DRAW_PHASE"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({
      type: "apply_restriction",
      restriction: "disable_draw_phase",
      target: "self",
      durationTurns: 1,
    });
  });

  it("SKIP_NEXT_DRAW_PHASE → apply_restriction disable_draw_phase for next turn window", () => {
    const ability = makeAbility({ operations: ["SKIP_NEXT_DRAW_PHASE"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({
      type: "apply_restriction",
      restriction: "disable_draw_phase",
      target: "self",
      durationTurns: 2,
    });
  });

  it("SKIP_BATTLE_PHASE → apply_restriction disable_battle_phase", () => {
    const ability = makeAbility({ operations: ["SKIP_BATTLE_PHASE"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({
      type: "apply_restriction",
      restriction: "disable_battle_phase",
      target: "self",
      durationTurns: 1,
    });
  });

  it("DISABLE_EFFECT → apply_restriction disable_effects", () => {
    const ability = makeAbility({ operations: ["DISABLE_EFFECT"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({
      type: "apply_restriction",
      restriction: "disable_effects",
      target: "self",
      durationTurns: 1,
    });
  });

  it("DISABLE_ATTACKS → apply_restriction disable_attacks", () => {
    const ability = makeAbility({ operations: ["DISABLE_ATTACKS"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({
      type: "apply_restriction",
      restriction: "disable_attacks",
      target: "self",
      durationTurns: 1,
    });
  });
});

// ── SET_STAT operations ───────────────────────────────────────────────────────

describe("parseOperation: SET_STAT", () => {
  it("SET_STAT: reputation 4000 → heal 4000 self", () => {
    const ability = makeAbility({ operations: ["SET_STAT: reputation 4000"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "heal", amount: 4000, target: "self" });
  });

  it("SET_STAT with no number → heal 1000 (default)", () => {
    const ability = makeAbility({ operations: ["SET_STAT: equal"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "heal", amount: 1000, target: "self" });
  });

  it("SET_STAT: stability 500 → heal 500 self", () => {
    const ability = makeAbility({ operations: ["SET_STAT: stability 500"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "heal", amount: 500, target: "self" });
  });
});

// ── RANDOM_CARD operations ────────────────────────────────────────────────────

describe("parseOperation: RANDOM_CARD", () => {
  it("RANDOM_CARD: from deck → { type: 'draw', count: 1 }", () => {
    const ability = makeAbility({ operations: ["RANDOM_CARD: from deck"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "draw", count: 1 });
  });

  it("RANDOM_CARD: opponent's hand → { type: 'draw', count: 1 }", () => {
    const ability = makeAbility({ operations: ["RANDOM_CARD: opponent's hand"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "draw", count: 1 });
  });
});

// ── STEAL operations ──────────────────────────────────────────────────────────

describe("parseOperation: STEAL", () => {
  it("STEAL: opponent's monster → special_summon from hand", () => {
    const ability = makeAbility({ operations: ["STEAL: opponent's monster"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "special_summon", from: "hand" });
  });

  it("STEAL: card → special_summon from hand", () => {
    const ability = makeAbility({ operations: ["STEAL: card"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "special_summon", from: "hand" });
  });
});

// ── COPY_LAST_SPELL_EFFECT operations ─────────────────────────────────────────

describe("parseOperation: COPY_LAST_SPELL_EFFECT", () => {
  it("COPY_LAST_SPELL_EFFECT → { type: 'draw', count: 1 }", () => {
    const ability = makeAbility({ operations: ["COPY_LAST_SPELL_EFFECT"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "draw", count: 1 });
  });

  it("COPY_LAST_SPELL_EFFECT: target → { type: 'draw', count: 1 }", () => {
    const ability = makeAbility({ operations: ["COPY_LAST_SPELL_EFFECT: target"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "draw", count: 1 });
  });
});

// ── REDUCE_DAMAGE operations ──────────────────────────────────────────────────

describe("parseOperation: REDUCE_DAMAGE", () => {
  it("REDUCE_DAMAGE: 50% → boost_defense 500 turn", () => {
    const ability = makeAbility({ operations: ["REDUCE_DAMAGE: 50%"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_defense", amount: 500, duration: "turn" });
  });

  it("REDUCE_DAMAGE: 100% → boost_defense 1000 turn", () => {
    const ability = makeAbility({ operations: ["REDUCE_DAMAGE: 100%"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_defense", amount: 1000, duration: "turn" });
  });

  it("REDUCE_DAMAGE: 25% → boost_defense 250 turn", () => {
    const ability = makeAbility({ operations: ["REDUCE_DAMAGE: 25%"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_defense", amount: 250, duration: "turn" });
  });

  it("REDUCE_DAMAGE with no percentage → boost_defense 500 turn (default 50%)", () => {
    const ability = makeAbility({ operations: ["REDUCE_DAMAGE: half"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "boost_defense", amount: 500, duration: "turn" });
  });
});

// ── REMOVE_COUNTERS operations ────────────────────────────────────────────────

describe("parseOperation: REMOVE_COUNTERS", () => {
  it("REMOVE_COUNTERS: 1 → remove_vice 1 selected", () => {
    const ability = makeAbility({ operations: ["REMOVE_COUNTERS: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "remove_vice", count: 1, target: "selected" });
  });

  it("REMOVE_COUNTERS: all → remove_vice 1 selected (count always 1)", () => {
    const ability = makeAbility({ operations: ["REMOVE_COUNTERS: all"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "remove_vice", count: 1, target: "selected" });
  });
});

// ── Skipped/undefined operations ─────────────────────────────────────────────

describe("parseOperation: skipped operations returning undefined", () => {
  it("MODIFY_COST parses into modify_cost action", () => {
    const ability = makeAbility({ operations: ["MODIFY_COST: reduce by 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({
      type: "modify_cost",
      cardType: "all",
      operation: "add",
      amount: -1,
      target: "self",
      durationTurns: 1,
    });
  });

  it("VIEW_TOP_CARDS parses into view_top_cards action", () => {
    const ability = makeAbility({ operations: ["VIEW_TOP_CARDS: 3"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "view_top_cards", count: 3 });
  });

  it("REARRANGE_CARDS parses into rearrange_top_cards action", () => {
    const ability = makeAbility({ operations: ["VIEW_TOP_CARDS: 3", "REARRANGE_CARDS"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[1]).toEqual({
      type: "rearrange_top_cards",
      count: 3,
      strategy: "reverse",
    });
  });

  it("REVEAL_HAND is skipped (undefined)", () => {
    const ability = makeAbility({ operations: ["REVEAL_HAND"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(0);
  });

  it("SHUFFLE is skipped (undefined)", () => {
    const ability = makeAbility({ operations: ["SHUFFLE"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(0);
  });

  it("ACTIVATE_TRAPS_TWICE is skipped (undefined)", () => {
    const ability = makeAbility({ operations: ["ACTIVATE_TRAPS_TWICE"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(0);
  });

  it("REVERSE_EFFECT is skipped (undefined)", () => {
    const ability = makeAbility({ operations: ["REVERSE_EFFECT"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(0);
  });

  it("unknown operation is skipped silently (undefined)", () => {
    const ability = makeAbility({ operations: ["SOME_UNKNOWN_OP: value"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(0);
  });

  it("empty string operation is skipped (undefined)", () => {
    const ability = makeAbility({ operations: [""] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(0);
  });

  it("whitespace-only operation is skipped (undefined)", () => {
    const ability = makeAbility({ operations: ["   "] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(0);
  });
});

// ── parseCSVAbility structural properties ────────────────────────────────────

describe("parseCSVAbility: structural output", () => {
  it("assigns id as 'eff_<index>'", () => {
    const ability = makeAbility({ operations: ["DRAW: 1"] });
    const def0 = parseCSVAbility(ability, 0);
    const def5 = parseCSVAbility(ability, 5);
    expect(def0.id).toBe("eff_0");
    expect(def5.id).toBe("eff_5");
  });

  it("description joins all operations with '; '", () => {
    const ability = makeAbility({ operations: ["DRAW: 2", "MODIFY_STAT: reputation +300"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.description).toBe("DRAW: 2; MODIFY_STAT: reputation +300");
  });

  it("description with single operation has no separator", () => {
    const ability = makeAbility({ operations: ["DRAW: 1"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.description).toBe("DRAW: 1");
  });

  it("collects all parsed actions from multiple valid operations", () => {
    const ability = makeAbility({
      operations: ["DRAW: 2", "MODIFY_STAT: reputation +300", "DISCARD: 1"],
    });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(3);
    expect(def.actions[0]).toEqual({ type: "draw", count: 2 });
    expect(def.actions[1]).toEqual({ type: "boost_attack", amount: 300, duration: "permanent" });
    expect(def.actions[2]).toEqual({ type: "discard", count: 1, target: "opponent" });
  });

  it("filters out undefined operations, keeping only valid ones", () => {
    const ability = makeAbility({
      operations: ["DRAW: 1", "MODIFY_COST: 0", "MODIFY_STAT: reputation +100"],
    });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(3);
    expect(def.actions[0]).toEqual({ type: "draw", count: 1 });
    expect(def.actions[1]).toEqual({
      type: "modify_cost",
      cardType: "all",
      operation: "add",
      amount: 0,
      target: "self",
      durationTurns: 1,
    });
    expect(def.actions[2]).toEqual({ type: "boost_attack", amount: 100, duration: "permanent" });
  });

  it("returns empty actions array when all operations are unsupported", () => {
    const ability = makeAbility({ operations: ["SHUFFLE", "REVEAL_HAND"] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions).toHaveLength(0);
  });

  it("leading/trailing whitespace in operations is trimmed", () => {
    const ability = makeAbility({ operations: ["  DRAW: 1  "] });
    const def = parseCSVAbility(ability, 0);
    expect(def.actions[0]).toEqual({ type: "draw", count: 1 });
  });
});

// ── parseCSVAbilities ─────────────────────────────────────────────────────────

describe("parseCSVAbilities", () => {
  it("returns undefined for null input", () => {
    expect(parseCSVAbilities(null)).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(parseCSVAbilities(undefined)).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(parseCSVAbilities([])).toBeUndefined();
  });

  it("returns undefined for non-array input (string)", () => {
    expect(parseCSVAbilities("DRAW: 1")).toBeUndefined();
  });

  it("returns undefined for non-array input (number)", () => {
    expect(parseCSVAbilities(42)).toBeUndefined();
  });

  it("returns undefined for non-array input (object)", () => {
    expect(parseCSVAbilities({ trigger: "OnSummon", operations: ["DRAW: 1"] })).toBeUndefined();
  });

  it("parses a single valid ability into an array", () => {
    const abilities: CSVAbility[] = [
      { trigger: "OnSummon", speed: 1, targets: ["self"], operations: ["DRAW: 1"] },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).not.toBeUndefined();
    expect(result).toHaveLength(1);
    expect(result![0].type).toBe("on_summon");
    expect(result![0].actions[0]).toEqual({ type: "draw", count: 1 });
  });

  it("parses multiple valid abilities into an array", () => {
    const abilities: CSVAbility[] = [
      { trigger: "OnSummon", speed: 1, targets: ["self"], operations: ["DRAW: 1"] },
      { trigger: "OnMainPhase", speed: 1, targets: ["opponent"], operations: ["DISCARD: 2"] },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).toHaveLength(2);
    expect(result![0].type).toBe("on_summon");
    expect(result![1].type).toBe("ignition");
  });

  it("assigns incrementing indices starting from 0", () => {
    const abilities: CSVAbility[] = [
      { trigger: "OnSummon", speed: 1, targets: ["self"], operations: ["DRAW: 1"] },
      { trigger: "OnMainPhase", speed: 1, targets: ["self"], operations: ["DRAW: 2"] },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result![0].id).toBe("eff_0");
    expect(result![1].id).toBe("eff_1");
  });

  it("returns undefined when all abilities produce no actions", () => {
    const abilities: CSVAbility[] = [
      { trigger: "OnSummon", speed: 1, targets: ["self"], operations: ["SHUFFLE"] },
      { trigger: "OnMainPhase", speed: 1, targets: ["self"], operations: ["SHUFFLE"] },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).toBeUndefined();
  });

  it("filters out abilities that produce no actions while keeping valid ones", () => {
    const abilities: CSVAbility[] = [
      { trigger: "OnSummon", speed: 1, targets: ["self"], operations: ["DRAW: 1"] },
      { trigger: "OnMainPhase", speed: 1, targets: ["self"], operations: ["SHUFFLE"] },
      { trigger: "OnDestroy", speed: 1, targets: ["self"], operations: ["DISCARD: 1"] },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).toHaveLength(2);
    expect(result![0].type).toBe("on_summon");
    expect(result![1].type).toBe("trigger");
  });

  it("skips ability entries that are null/falsy", () => {
    const abilities = [
      null,
      { trigger: "OnSummon", speed: 1, targets: ["self"], operations: ["DRAW: 1"] },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).toHaveLength(1);
    expect(result![0].type).toBe("on_summon");
  });

  it("skips ability entries missing trigger field", () => {
    const abilities = [
      { speed: 1, targets: ["self"], operations: ["DRAW: 1"] } as unknown as CSVAbility,
      { trigger: "OnMainPhase", speed: 1, targets: ["self"], operations: ["DRAW: 2"] },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).toHaveLength(1);
    expect(result![0].type).toBe("ignition");
  });

  it("skips ability entries missing operations field", () => {
    const abilities = [
      { trigger: "OnSummon", speed: 1, targets: ["self"] } as unknown as CSVAbility,
      { trigger: "OnMainPhase", speed: 1, targets: ["self"], operations: ["DRAW: 2"] },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).toHaveLength(1);
    expect(result![0].type).toBe("ignition");
  });

  it("skips ability entries with empty trigger string", () => {
    const abilities: CSVAbility[] = [
      { trigger: "", speed: 1, targets: ["self"], operations: ["DRAW: 1"] },
      { trigger: "OnMainPhase", speed: 1, targets: ["self"], operations: ["DRAW: 2"] },
    ];
    const result = parseCSVAbilities(abilities);
    // Empty trigger is falsy, so it gets skipped
    expect(result).toHaveLength(1);
    expect(result![0].type).toBe("ignition");
  });

  it("returns undefined when array contains only null/undefined entries", () => {
    const abilities = [null, undefined, null];
    const result = parseCSVAbilities(abilities);
    expect(result).toBeUndefined();
  });
});

// ── parseCSVAbility index assignment ─────────────────────────────────────────

describe("parseCSVAbility: index assignment", () => {
  it("index 0 → id is 'eff_0'", () => {
    const ability = makeAbility({ operations: ["DRAW: 1"] });
    expect(parseCSVAbility(ability, 0).id).toBe("eff_0");
  });

  it("index 10 → id is 'eff_10'", () => {
    const ability = makeAbility({ operations: ["DRAW: 1"] });
    expect(parseCSVAbility(ability, 10).id).toBe("eff_10");
  });

  it("index 99 → id is 'eff_99'", () => {
    const ability = makeAbility({ operations: ["DRAW: 1"] });
    expect(parseCSVAbility(ability, 99).id).toBe("eff_99");
  });
});

// ── End-to-end scenario tests ─────────────────────────────────────────────────

describe("parseCSVAbilities: real-world-like scenarios", () => {
  it("parses a multi-effect monster (summon draw + ignition damage)", () => {
    const abilities: CSVAbility[] = [
      {
        trigger: "OnSummon",
        speed: 1,
        targets: ["self"],
        operations: ["DRAW: 1"],
      },
      {
        trigger: "OnMainPhase",
        speed: 1,
        targets: ["opponent"],
        operations: ["MODIFY_STAT: reputation -500"],
      },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).toHaveLength(2);

    const summonEffect = result![0];
    expect(summonEffect.type).toBe("on_summon");
    expect(summonEffect.oncePerTurn).toBe(true);
    expect(summonEffect.actions[0]).toEqual({ type: "draw", count: 1 });

    const ignitionEffect = result![1];
    expect(ignitionEffect.type).toBe("ignition");
    expect(ignitionEffect.oncePerTurn).toBe(true);
    expect(ignitionEffect.actions[0]).toEqual({ type: "damage", amount: 500, target: "opponent" });
  });

  it("parses a quick-effect trap negation card", () => {
    const abilities: CSVAbility[] = [
      {
        trigger: "OnTrapTargetingYou",
        speed: 2,
        targets: ["targetCard"],
        operations: ["NEGATE"],
      },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).toHaveLength(1);

    const quickEffect = result![0];
    expect(quickEffect.type).toBe("quick");
    expect(quickEffect.oncePerTurn).toBe(false);
    expect(quickEffect.targetFilter).toEqual({ owner: "opponent" });
    expect(quickEffect.targetCount).toBe(1);
    expect(quickEffect.actions[0]).toEqual({ type: "negate", target: "last_chain_link" });
  });

  it("parses a continuous draw-engine card", () => {
    const abilities: CSVAbility[] = [
      {
        trigger: "OnTurnStart",
        speed: 1,
        targets: ["self"],
        operations: ["DRAW: 1"],
      },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).toHaveLength(1);
    expect(result![0].type).toBe("continuous");
    expect(result![0].oncePerTurn).toBe(false);
  });

  it("parses a mixed ability list with only some producing actions", () => {
    const abilities: CSVAbility[] = [
      {
        trigger: "OnSummon",
        speed: 1,
        targets: ["self"],
        operations: ["DRAW: 2", "MODIFY_STAT: reputation +200"],
      },
      {
        trigger: "OnMainPhase",
        speed: 1,
        targets: ["alliedStereotypes"],
        operations: ["VIEW_TOP_CARDS: 3", "SHUFFLE"],
      },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).toHaveLength(2);
    expect(result![0].actions).toHaveLength(2);
    expect(result![1].actions).toEqual([{ type: "view_top_cards", count: 3 }]);
  });

  it("parses a speed-override quick effect on a summon trigger", () => {
    const abilities: CSVAbility[] = [
      {
        trigger: "OnSummon",
        speed: "quick",
        targets: ["attacker"],
        operations: ["DESTROY: 1"],
      },
    ];
    const result = parseCSVAbilities(abilities);
    expect(result).toHaveLength(1);
    // Speed override: quick trumps on_summon
    expect(result![0].type).toBe("quick");
    // oncePerTurn checks raw trigger field (OnSummon), not overridden type
    expect(result![0].oncePerTurn).toBe(true);
    expect(result![0].actions[0]).toEqual({ type: "destroy", target: "selected" });
  });
});
