import { describe, it, expect } from "vitest";
import type { GameState, BoardCard } from "../types/state.js";
import type { CardDefinition, EffectAction } from "../types/cards.js";
import { executeAction, findBoardCard } from "../effects/operations.js";
import { executeEffect, findAbilityByTrigger } from "../effects/interpreter.js";
import { resolveEffectActions, canActivateEffect, detectTriggerEffects } from "../rules/effects.js";
import { createEngine } from "../engine.js";
import { defineCards } from "../cards.js";

// ── Test Helpers ─────────────────────────────────────────────────

function createMinimalState(): GameState {
  return {
    config: {
      startingHandSize: 5,
      startingLifePoints: 8000,
      maxHandSize: 7,
      maxViceCounters: 3,
      breakdownDamage: 2000,
    },
    cardLookup: {},
    hostId: "player1",
    awayId: "player2",
    hostHand: [],
    hostBoard: [],
    hostSpellTrapZone: [],
    hostFieldSpell: null,
    hostDeck: ["deck_card_1", "deck_card_2", "deck_card_3"],
    hostGraveyard: [],
    hostBanished: [],
    awayHand: [],
    awayBoard: [],
    awaySpellTrapZone: [],
    awayFieldSpell: null,
    awayDeck: ["away_deck_1", "away_deck_2"],
    awayGraveyard: [],
    awayBanished: [],
    hostLifePoints: 8000,
    awayLifePoints: 8000,
    hostBreakdownsCaused: 0,
    awayBreakdownsCaused: 0,
    currentTurnPlayer: "host",
    turnNumber: 1,
    currentPhase: "main",
    hostNormalSummonedThisTurn: false,
    awayNormalSummonedThisTurn: false,
    currentChain: [],
    currentPriorityPlayer: null,
    pendingAction: null,
    temporaryModifiers: [],
    lingeringEffects: [],
    optUsedThisTurn: [],
    hoptUsedEffects: [],
    winner: null,
    winReason: null,
    gameOver: false,
  };
}

function createBoardCard(cardId: string, viceCounters = 0): BoardCard {
  return {
    cardId,
    definitionId: "def_" + cardId,
    position: "attack",
    faceDown: false,
    canAttack: true,
    hasAttackedThisTurn: false,
    changedPositionThisTurn: false,
    viceCounters,
    temporaryBoosts: { attack: 0, defense: 0 },
    equippedCards: [],
    turnSummoned: 1,
  };
}

// ── Tests: Operation Execution ───────────────────────────────────

describe("executeAction", () => {
  it("DESTROY selected generates CARD_DESTROYED + CARD_SENT_TO_GRAVEYARD", () => {
    const state = createMinimalState();
    state.hostBoard.push(createBoardCard("monster_1"));

    const action: EffectAction = { type: "destroy", target: "selected" };
    const events = executeAction(state, action, "away", "source_card", ["monster_1"]);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "CARD_DESTROYED", cardId: "monster_1", reason: "effect" });
    expect(events[1]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "monster_1",
      from: "board",
      sourceSeat: "host",
    });
  });

  it("DESTROY all_opponent_monsters generates events for each monster", () => {
    const state = createMinimalState();
    state.awayBoard.push(createBoardCard("monster_1"));
    state.awayBoard.push(createBoardCard("monster_2"));

    const action: EffectAction = { type: "destroy", target: "all_opponent_monsters" };
    const events = executeAction(state, action, "host", "source_card", []);

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ type: "CARD_DESTROYED", cardId: "monster_1", reason: "effect" });
    expect(events[1]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "monster_1",
      from: "board",
      sourceSeat: "away",
    });
    expect(events[2]).toEqual({ type: "CARD_DESTROYED", cardId: "monster_2", reason: "effect" });
    expect(events[3]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "monster_2",
      from: "board",
      sourceSeat: "away",
    });
  });

  it("DRAW generates correct number of CARD_DRAWN events", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "draw", count: 2 };
    const events = executeAction(state, action, "host", "source_card", []);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "CARD_DRAWN", seat: "host", cardId: "deck_card_1" });
    expect(events[1]).toEqual({ type: "CARD_DRAWN", seat: "host", cardId: "deck_card_2" });
  });

  it("DRAW respects deck size limit", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "draw", count: 10 };
    const events = executeAction(state, action, "host", "source_card", []);

    expect(events).toHaveLength(3); // Only 3 cards in deck
  });

  it("DRAW throws engine invariant for corrupted deck slots", () => {
    const state = createMinimalState();
    state.hostDeck = [undefined as unknown as string, "deck_card_2"];

    const action: EffectAction = { type: "draw", count: 1 };
    expect(() => executeAction(state, action, "host", "source_card", [])).toThrow("[engine invariant]");
  });

  it("DAMAGE generates DAMAGE_DEALT to opponent", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "damage", amount: 500, target: "opponent" };
    const events = executeAction(state, action, "host", "source_card", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "DAMAGE_DEALT", seat: "away", amount: 500, isBattle: false });
  });

  it("HEAL generates negative DAMAGE_DEALT", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "heal", amount: 500, target: "self" };
    const events = executeAction(state, action, "host", "source_card", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "DAMAGE_DEALT", seat: "host", amount: -500, isBattle: false });
  });

  it("MODIFY_STAT (boost_attack) generates MODIFIER_APPLIED with attack field", () => {
    const state = createMinimalState();
    state.hostBoard.push(createBoardCard("monster_1"));

    const action: EffectAction = { type: "boost_attack", amount: 300, duration: "permanent" };
    const events = executeAction(state, action, "host", "monster_1", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "MODIFIER_APPLIED",
      cardId: "monster_1",
      field: "attack",
      amount: 300,
      source: "monster_1",
      expiresAt: "permanent",
    });
  });

  it("MODIFY_STAT (boost_defense) generates MODIFIER_APPLIED with defense field", () => {
    const state = createMinimalState();
    state.hostBoard.push(createBoardCard("monster_1"));

    const action: EffectAction = { type: "boost_defense", amount: 500, duration: "turn" };
    const events = executeAction(state, action, "host", "monster_1", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "MODIFIER_APPLIED",
      cardId: "monster_1",
      field: "defense",
      amount: 500,
      source: "monster_1",
      expiresAt: "end_of_turn",
    });
  });

  it("ADD_VICE generates VICE_COUNTER_ADDED", () => {
    const state = createMinimalState();
    state.hostBoard.push(createBoardCard("monster_1", 1));

    const action: EffectAction = { type: "add_vice", count: 1, target: "selected" };
    const events = executeAction(state, action, "host", "source_card", ["monster_1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "VICE_COUNTER_ADDED", cardId: "monster_1", newCount: 2 });
  });

  it("REMOVE_VICE generates VICE_COUNTER_REMOVED", () => {
    const state = createMinimalState();
    state.hostBoard.push(createBoardCard("monster_1", 2));

    const action: EffectAction = { type: "remove_vice", count: 1, target: "selected" };
    const events = executeAction(state, action, "host", "source_card", ["monster_1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "VICE_COUNTER_REMOVED", cardId: "monster_1", newCount: 1 });
  });

  it("BANISH generates CARD_BANISHED", () => {
    const state = createMinimalState();
    state.hostBoard.push(createBoardCard("monster_1"));

    const action: EffectAction = { type: "banish", target: "selected" };
    const events = executeAction(state, action, "host", "source_card", ["monster_1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "CARD_BANISHED",
      cardId: "monster_1",
      from: "board",
      sourceSeat: "host",
    });
  });

  it("RETURN_TO_HAND generates CARD_RETURNED_TO_HAND", () => {
    const state = createMinimalState();
    state.hostBoard.push(createBoardCard("monster_1"));

    const action: EffectAction = { type: "return_to_hand", target: "selected" };
    const events = executeAction(state, action, "host", "source_card", ["monster_1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "CARD_RETURNED_TO_HAND",
      cardId: "monster_1",
      from: "board",
      sourceSeat: "host",
    });
  });
});

describe("findBoardCard", () => {
  it("finds card on host board", () => {
    const state = createMinimalState();
    state.hostBoard.push(createBoardCard("monster_1"));

    const result = findBoardCard(state, "monster_1");
    expect(result).not.toBeNull();
    expect(result?.seat).toBe("host");
    expect(result?.card.cardId).toBe("monster_1");
  });

  it("finds card on away board", () => {
    const state = createMinimalState();
    state.awayBoard.push(createBoardCard("monster_2"));

    const result = findBoardCard(state, "monster_2");
    expect(result).not.toBeNull();
    expect(result?.seat).toBe("away");
    expect(result?.card.cardId).toBe("monster_2");
  });

  it("returns null for non-existent card", () => {
    const state = createMinimalState();
    const result = findBoardCard(state, "nonexistent");
    expect(result).toBeNull();
  });
});

// ── Tests: Effect Interpreter ────────────────────────────────────

describe("executeEffect", () => {
  it("executes all actions in an ability", () => {
    const state = createMinimalState();
    state.hostBoard.push(createBoardCard("monster_1"));

    const cardDef: CardDefinition = {
      id: "test_card",
      name: "Test Card",
      type: "spell",
      description: "Test",
      rarity: "common",
      effects: [
        {
          id: "eff_0",
          type: "ignition",
          description: "Destroy and draw",
          actions: [
            { type: "destroy", target: "selected" },
            { type: "draw", count: 1 },
          ],
        },
      ],
    };

    const events = executeEffect(state, cardDef, 0, "host", "source_card", ["monster_1"]);

    // Should have destroy events (2) + draw event (1)
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0].type).toBe("CARD_DESTROYED");
    expect(events[1].type).toBe("CARD_SENT_TO_GRAVEYARD");
    expect(events[2].type).toBe("CARD_DRAWN");
  });

  it("returns empty array for invalid ability index", () => {
    const cardDef: CardDefinition = {
      id: "test_card",
      name: "Test Card",
      type: "spell",
      description: "Test",
      rarity: "common",
      effects: [
        {
          id: "eff_0",
          type: "ignition",
          description: "Draw",
          actions: [{ type: "draw", count: 1 }],
        },
      ],
    };

    const state = createMinimalState();
    const events = executeEffect(state, cardDef, 5, "host", "source_card", []);
    expect(events).toEqual([]);
  });

  it("returns empty array for negative ability index", () => {
    const cardDef: CardDefinition = {
      id: "test_card",
      name: "Test Card",
      type: "spell",
      description: "Test",
      rarity: "common",
      effects: [],
    };

    const state = createMinimalState();
    const events = executeEffect(state, cardDef, -1, "host", "source_card", []);
    expect(events).toEqual([]);
  });

  it("returns empty array when card has no effects", () => {
    const cardDef: CardDefinition = {
      id: "test_card",
      name: "Test Card",
      type: "spell",
      description: "Test",
      rarity: "common",
    };

    const state = createMinimalState();
    const events = executeEffect(state, cardDef, 0, "host", "source_card", []);
    expect(events).toEqual([]);
  });
});

describe("findAbilityByTrigger", () => {
  it("finds ability by trigger type", () => {
    const cardDef: CardDefinition = {
      id: "test_card",
      name: "Test Card",
      type: "stereotype",
      description: "Test",
      rarity: "common",
      effects: [
        {
          id: "eff_0",
          type: "ignition",
          description: "Ignition effect",
          actions: [{ type: "draw", count: 1 }],
        },
        {
          id: "eff_1",
          type: "trigger",
          description: "Trigger effect",
          actions: [{ type: "damage", amount: 500, target: "opponent" }],
        },
      ],
    };

    const result = findAbilityByTrigger(cardDef, "trigger");
    expect(result).not.toBeNull();
    expect(result?.index).toBe(1);
    expect(result?.ability.type).toBe("trigger");
  });

  it("returns null when trigger not found", () => {
    const cardDef: CardDefinition = {
      id: "test_card",
      name: "Test Card",
      type: "spell",
      description: "Test",
      rarity: "common",
      effects: [
        {
          id: "eff_0",
          type: "ignition",
          description: "Ignition effect",
          actions: [{ type: "draw", count: 1 }],
        },
      ],
    };

    const result = findAbilityByTrigger(cardDef, "quick");
    expect(result).toBeNull();
  });

  it("returns null when card has no effects", () => {
    const cardDef: CardDefinition = {
      id: "test_card",
      name: "Test Card",
      type: "spell",
      description: "Test",
      rarity: "common",
    };

    const result = findAbilityByTrigger(cardDef, "ignition");
    expect(result).toBeNull();
  });
});

// ── Tests: New operations (discard, special_summon, change_position) ─

describe("executeAction - newly implemented actions", () => {
  it("DISCARD generates CARD_SENT_TO_GRAVEYARD for opponent's hand", () => {
    const state = createMinimalState();
    state.awayHand = ["card_a", "card_b", "card_c"];

    const action: EffectAction = { type: "discard", count: 2, target: "opponent" };
    const events = executeAction(state, action, "host", "source_card", []);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "card_c",
      from: "hand",
      sourceSeat: "away",
    });
    expect(events[1]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "card_b",
      from: "hand",
      sourceSeat: "away",
    });
  });

  it("DISCARD respects hand size", () => {
    const state = createMinimalState();
    state.awayHand = ["card_a"];

    const action: EffectAction = { type: "discard", count: 3, target: "opponent" };
    const events = executeAction(state, action, "host", "source_card", []);

    expect(events).toHaveLength(1); // Only 1 card in hand
  });

  it("DISCARD throws engine invariant for corrupted hand slots", () => {
    const state = createMinimalState();
    state.awayHand = [undefined as unknown as string];

    const action: EffectAction = { type: "discard", count: 1, target: "opponent" };
    expect(() => executeAction(state, action, "host", "source_card", [])).toThrow("[engine invariant]");
  });

  it("SPECIAL_SUMMON generates SPECIAL_SUMMONED event", () => {
    const state = createMinimalState();
    state.hostGraveyard = ["monster_in_gy"];

    const action: EffectAction = { type: "special_summon", from: "graveyard" };
    const events = executeAction(state, action, "host", "source_card", ["monster_in_gy"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "SPECIAL_SUMMONED",
      seat: "host",
      cardId: "monster_in_gy",
      from: "graveyard",
      position: "attack",
    });
  });

  it("CHANGE_POSITION flips board card position", () => {
    const state = createMinimalState();
    state.hostBoard.push(createBoardCard("monster_1"));

    const action: EffectAction = { type: "change_position", target: "selected" };
    const events = executeAction(state, action, "host", "source_card", ["monster_1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "POSITION_CHANGED",
      cardId: "monster_1",
      from: "attack",
      to: "defense",
    });
  });

  it("NEGATE returns empty array (no-op in simple chain mode)", () => {
    const state = createMinimalState();

    const action: EffectAction = { type: "negate", target: "last_chain_link" };
    const events = executeAction(state, action, "host", "source_card", []);

    expect(events).toHaveLength(0);
  });
});

// ── Tests: resolveEffectActions ─────────────────────────────────

describe("resolveEffectActions", () => {
  it("resolves multiple actions in sequence", () => {
    const state = createMinimalState();
    state.hostBoard.push(createBoardCard("monster_1"));

    const actions: EffectAction[] = [
      { type: "draw", count: 1 },
      { type: "damage", amount: 300, target: "opponent" },
    ];

    const events = resolveEffectActions(state, "host", actions, "source_card", []);

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("CARD_DRAWN");
    expect(events[1]).toEqual({ type: "DAMAGE_DEALT", seat: "away", amount: 300, isBattle: false });
  });

  it("returns empty array for empty actions", () => {
    const state = createMinimalState();
    const events = resolveEffectActions(state, "host", [], "source_card", []);
    expect(events).toEqual([]);
  });
});

// ── Tests: canActivateEffect ────────────────────────────────────

describe("canActivateEffect", () => {
  it("allows effect when OPT not used this turn", () => {
    const state = createMinimalState();
    state.optUsedThisTurn = [];

    const result = canActivateEffect(state, {
      id: "eff_1",
      type: "ignition",
      description: "Test",
      actions: [],
      oncePerTurn: true,
    });

    expect(result).toBe(true);
  });

  it("blocks effect when OPT already used this turn", () => {
    const state = createMinimalState();
    state.optUsedThisTurn = ["eff_1"];

    const result = canActivateEffect(state, {
      id: "eff_1",
      type: "ignition",
      description: "Test",
      actions: [],
      oncePerTurn: true,
    });

    expect(result).toBe(false);
  });

  it("blocks effect when HOPT already used (cross-turn)", () => {
    const state = createMinimalState();
    state.hoptUsedEffects = ["eff_hard"];

    const result = canActivateEffect(state, {
      id: "eff_hard",
      type: "ignition",
      description: "Test",
      actions: [],
      hardOncePerTurn: true,
    });

    expect(result).toBe(false);
  });

  it("allows effect with no OPT/HOPT restrictions", () => {
    const state = createMinimalState();
    state.optUsedThisTurn = ["some_other"];
    state.hoptUsedEffects = ["some_other"];

    const result = canActivateEffect(state, {
      id: "eff_free",
      type: "ignition",
      description: "Test",
      actions: [],
    });

    expect(result).toBe(true);
  });
});

// ── Tests: detectTriggerEffects ─────────────────────────────────

describe("detectTriggerEffects", () => {
  it("detects on_summon effect when monster is summoned", () => {
    const state = createMinimalState();
    state.cardLookup["warrior_summon"] = {
      id: "warrior_summon",
      name: "Summoner Warrior",
      type: "stereotype",
      description: "Draws on summon",
      rarity: "common",
      attack: 1500,
      defense: 1200,
      level: 4,
      effects: [
        {
          id: "eff_on_summon_draw",
          type: "on_summon",
          description: "Draw 1 card",
          actions: [{ type: "draw", count: 1 }],
        },
      ],
    };

    const summonEvent = {
      type: "MONSTER_SUMMONED" as const,
      seat: "host" as const,
      cardId: "warrior_summon",
      position: "attack" as const,
      tributes: [],
    };

    const triggered = detectTriggerEffects(state, [summonEvent]);

    // Should have EFFECT_ACTIVATED + CARD_DRAWN
    expect(triggered.length).toBeGreaterThanOrEqual(2);
    expect(triggered[0]).toMatchObject({
      type: "EFFECT_ACTIVATED",
      seat: "host",
      cardId: "warrior_summon",
      effectIndex: 0,
    });
    expect(triggered[1]).toMatchObject({
      type: "CARD_DRAWN",
      seat: "host",
    });
  });

  it("skips on_summon if OPT already used", () => {
    const state = createMinimalState();
    state.optUsedThisTurn = ["eff_on_summon_draw"];
    state.cardLookup["warrior_summon"] = {
      id: "warrior_summon",
      name: "Summoner Warrior",
      type: "stereotype",
      description: "Draws on summon",
      rarity: "common",
      attack: 1500,
      defense: 1200,
      level: 4,
      effects: [
        {
          id: "eff_on_summon_draw",
          type: "on_summon",
          description: "Draw 1 card",
          actions: [{ type: "draw", count: 1 }],
          oncePerTurn: true,
        },
      ],
    };

    const summonEvent = {
      type: "MONSTER_SUMMONED" as const,
      seat: "host" as const,
      cardId: "warrior_summon",
      position: "attack" as const,
      tributes: [],
    };

    const triggered = detectTriggerEffects(state, [summonEvent]);
    expect(triggered).toHaveLength(0);
  });

  it("ignores non-summon events", () => {
    const state = createMinimalState();
    state.cardLookup["some_card"] = {
      id: "some_card",
      name: "Some Card",
      type: "stereotype",
      description: "Has on_summon",
      rarity: "common",
      effects: [
        {
          id: "eff_1",
          type: "on_summon",
          description: "Draw 1",
          actions: [{ type: "draw", count: 1 }],
        },
      ],
    };

    const drawEvent = {
      type: "CARD_DRAWN" as const,
      seat: "host" as const,
      cardId: "some_card",
    };

    const triggered = detectTriggerEffects(state, [drawEvent]);
    expect(triggered).toHaveLength(0);
  });

  it("ignores cards without on_summon effect type", () => {
    const state = createMinimalState();
    state.cardLookup["vanilla_monster"] = {
      id: "vanilla_monster",
      name: "Vanilla Monster",
      type: "stereotype",
      description: "No effects",
      rarity: "common",
      attack: 1500,
      defense: 1200,
      level: 4,
    };

    const summonEvent = {
      type: "MONSTER_SUMMONED" as const,
      seat: "host" as const,
      cardId: "vanilla_monster",
      position: "attack" as const,
      tributes: [],
    };

    const triggered = detectTriggerEffects(state, [summonEvent]);
    expect(triggered).toHaveLength(0);
  });
});

// ── Integration Tests: Full Engine with Effects ─────────────────

describe("Effect Resolution - Integration", () => {
  const effectCards: CardDefinition[] = [
    {
      id: "summon-drawer",
      name: "Summon Drawer",
      type: "stereotype",
      description: "Draws a card when summoned",
      rarity: "common",
      attack: 1200,
      defense: 800,
      level: 3,
      effects: [
        {
          id: "eff_summon_draw",
          type: "on_summon",
          description: "Draw 1 card",
          actions: [{ type: "draw", count: 1 }],
        },
      ],
    },
    {
      id: "damage-spell",
      name: "Flame Burst",
      type: "spell",
      description: "Deal 500 damage to opponent",
      rarity: "common",
      spellType: "normal",
      effects: [
        {
          id: "eff_flame_burst",
          type: "ignition",
          description: "Deal 500 damage",
          actions: [{ type: "damage", amount: 500, target: "opponent" }],
        },
      ],
    },
    {
      id: "boost-monster",
      name: "Booster Warrior",
      type: "stereotype",
      description: "Can boost its own attack",
      rarity: "common",
      attack: 1000,
      defense: 1000,
      level: 4,
      effects: [
        {
          id: "eff_self_boost",
          type: "ignition",
          description: "Boost own ATK by 500",
          actions: [{ type: "boost_attack", amount: 500, duration: "turn" }],
        },
      ],
    },
    {
      id: "opt-monster",
      name: "OPT Warrior",
      type: "stereotype",
      description: "Has a once-per-turn draw effect",
      rarity: "common",
      attack: 1500,
      defense: 1200,
      level: 4,
      effects: [
        {
          id: "eff_opt_draw",
          type: "ignition",
          description: "Draw 1 (OPT)",
          actions: [{ type: "draw", count: 1 }],
          oncePerTurn: true,
        },
      ],
    },
    {
      id: "vanilla-monster",
      name: "Plain Warrior",
      type: "stereotype",
      description: "A normal monster",
      rarity: "common",
      attack: 1800,
      defense: 1200,
      level: 4,
    },
  ];

  const effectCardLookup = defineCards(effectCards);

  function createEffectTestDeck(): string[] {
    const cards = ["summon-drawer", "damage-spell", "boost-monster", "opt-monster", "vanilla-monster"];
    return Array(40)
      .fill(null)
      .map((_, i) => cards[i % cards.length]);
  }

  it("on_summon effect draws a card when monster is summoned", () => {
    const engine = createEngine({
      cardLookup: effectCardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createEffectTestDeck(),
      awayDeck: createEffectTestDeck(),
      seed: 42,
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = ["summon-drawer"];

    const handSizeBefore = state.hostHand.length;
    const deckSizeBefore = state.hostDeck.length;

    // Summon the card
    const events = engine.decide({ type: "SUMMON", cardId: "summon-drawer", position: "attack" }, "host");
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].type).toBe("MONSTER_SUMMONED");

    engine.evolve(events);
    const newState = engine.getState();

    // Card was summoned (removed from hand to board)
    expect(newState.hostBoard.length).toBe(1);
    expect(newState.hostBoard[0].cardId).toBe("summon-drawer");

    // on_summon draw effect should have drawn a card
    // Hand: started with 1, removed 1 (summon), gained 1 (draw) = 1
    expect(newState.hostHand.length).toBe(1);
    // Deck should have lost one card
    expect(newState.hostDeck.length).toBe(deckSizeBefore - 1);
  });

  it("spell effect deals damage to opponent", () => {
    const engine = createEngine({
      cardLookup: effectCardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createEffectTestDeck(),
      awayDeck: createEffectTestDeck(),
      seed: 42,
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = ["damage-spell"];

    const lpBefore = state.awayLifePoints;

    // Activate the spell
    const events = engine.decide({ type: "ACTIVATE_SPELL", cardId: "damage-spell", targets: [] }, "host");
    expect(events.length).toBeGreaterThanOrEqual(1);

    // Should have SPELL_ACTIVATED and DAMAGE_DEALT
    const spellEvent = events.find((e) => e.type === "SPELL_ACTIVATED");
    const damageEvent = events.find((e) => e.type === "DAMAGE_DEALT");
    expect(spellEvent).toBeDefined();
    expect(damageEvent).toBeDefined();

    engine.evolve(events);
    const newState = engine.getState();

    // Opponent should have taken 500 damage
    expect(newState.awayLifePoints).toBe(lpBefore - 500);

    // Spell should be in graveyard (normal spell)
    expect(newState.hostGraveyard).toContain("damage-spell");
  });

  it("boost_attack modifier applies to board card via ACTIVATE_EFFECT", () => {
    const engine = createEngine({
      cardLookup: effectCardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createEffectTestDeck(),
      awayDeck: createEffectTestDeck(),
      seed: 42,
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = [];
    state.hostBoard = [
      {
        cardId: "boost-monster",
        definitionId: "boost-monster",
        position: "attack",
        faceDown: false,
        canAttack: true,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
    ];

    // Activate the ignition effect (effect index 0)
    const events = engine.decide(
      { type: "ACTIVATE_EFFECT", cardId: "boost-monster", effectIndex: 0 },
      "host"
    );

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].type).toBe("EFFECT_ACTIVATED");
    expect(events[1]).toMatchObject({
      type: "MODIFIER_APPLIED",
      cardId: "boost-monster",
      field: "attack",
      amount: 500,
    });

    engine.evolve(events);
    const newState = engine.getState();

    // Check boost was applied
    const boostedCard = newState.hostBoard.find((c) => c.cardId === "boost-monster");
    expect(boostedCard).toBeDefined();
    expect(boostedCard!.temporaryBoosts.attack).toBe(500);
  });

  it("OPT effect can only be activated once per turn", () => {
    const engine = createEngine({
      cardLookup: effectCardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createEffectTestDeck(),
      awayDeck: createEffectTestDeck(),
      seed: 42,
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = [];
    state.hostBoard = [
      {
        cardId: "opt-monster",
        definitionId: "opt-monster",
        position: "attack",
        faceDown: false,
        canAttack: true,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
    ];

    // First activation should succeed
    const events1 = engine.decide(
      { type: "ACTIVATE_EFFECT", cardId: "opt-monster", effectIndex: 0 },
      "host"
    );
    expect(events1.length).toBeGreaterThanOrEqual(1);
    expect(events1[0].type).toBe("EFFECT_ACTIVATED");

    engine.evolve(events1);

    // Verify OPT was tracked
    const stateAfterFirst = engine.getState();
    expect(stateAfterFirst.optUsedThisTurn).toContain("eff_opt_draw");

    // Second activation should fail (empty events)
    const events2 = engine.decide(
      { type: "ACTIVATE_EFFECT", cardId: "opt-monster", effectIndex: 0 },
      "host"
    );
    expect(events2).toHaveLength(0);
  });

  it("ACTIVATE_EFFECT rejected when card not on board", () => {
    const engine = createEngine({
      cardLookup: effectCardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createEffectTestDeck(),
      awayDeck: createEffectTestDeck(),
      seed: 42,
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostBoard = [];

    const events = engine.decide(
      { type: "ACTIVATE_EFFECT", cardId: "boost-monster", effectIndex: 0 },
      "host"
    );
    expect(events).toHaveLength(0);
  });

  it("ACTIVATE_EFFECT rejected outside main phases", () => {
    const engine = createEngine({
      cardLookup: effectCardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createEffectTestDeck(),
      awayDeck: createEffectTestDeck(),
      seed: 42,
    });

    const state = engine.getState();
    state.currentPhase = "combat";
    state.hostBoard = [
      {
        cardId: "boost-monster",
        definitionId: "boost-monster",
        position: "attack",
        faceDown: false,
        canAttack: true,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
    ];

    const events = engine.decide(
      { type: "ACTIVATE_EFFECT", cardId: "boost-monster", effectIndex: 0 },
      "host"
    );
    expect(events).toHaveLength(0);
  });

  it("EFFECT_ACTIVATED evolve tracks HOPT across turns", () => {
    const engine = createEngine({
      cardLookup: defineCards([
        {
          id: "hopt-monster",
          name: "HOPT Warrior",
          type: "stereotype",
          description: "Hard OPT effect",
          rarity: "common",
          attack: 1500,
          defense: 1200,
          level: 4,
          effects: [
            {
              id: "eff_hopt_draw",
              type: "ignition",
              description: "Draw 1 (HOPT)",
              actions: [{ type: "draw", count: 1 }],
              hardOncePerTurn: true,
            },
          ],
        },
        {
          id: "filler",
          name: "Filler Card",
          type: "stereotype",
          description: "Filler",
          rarity: "common",
          attack: 1000,
          defense: 1000,
          level: 3,
        },
      ]),
      hostId: "player1",
      awayId: "player2",
      hostDeck: Array(40).fill("filler"),
      awayDeck: Array(40).fill("filler"),
      seed: 42,
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostBoard = [
      {
        cardId: "hopt-monster",
        definitionId: "hopt-monster",
        position: "attack",
        faceDown: false,
        canAttack: true,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
    ];

    // First activation succeeds
    const events1 = engine.decide(
      { type: "ACTIVATE_EFFECT", cardId: "hopt-monster", effectIndex: 0 },
      "host"
    );
    expect(events1.length).toBeGreaterThanOrEqual(1);
    engine.evolve(events1);

    // End turn and start next turn
    const endEvents = engine.decide({ type: "END_TURN" }, "host");
    engine.evolve(endEvents);

    // After turn change, OPT resets but HOPT persists
    const stateAfterTurn = engine.getState();
    expect(stateAfterTurn.optUsedThisTurn).toEqual([]); // OPT reset
    expect(stateAfterTurn.hoptUsedEffects).toContain("eff_hopt_draw"); // HOPT persists

    // Switch back to host and try again
    const endEvents2 = engine.decide({ type: "END_TURN" }, "away");
    engine.evolve(endEvents2);

    const stateBack = engine.getState();
    stateBack.currentPhase = "main";
    stateBack.hostBoard = [
      {
        cardId: "hopt-monster",
        definitionId: "hopt-monster",
        position: "attack",
        faceDown: false,
        canAttack: true,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
    ];

    // Second activation should fail (HOPT persists)
    const events2 = engine.decide(
      { type: "ACTIVATE_EFFECT", cardId: "hopt-monster", effectIndex: 0 },
      "host"
    );
    expect(events2).toHaveLength(0);
  });
});
