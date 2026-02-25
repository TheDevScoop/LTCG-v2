/**
 * operations.test.ts
 *
 * Unit tests for packages/engine/src/effects/operations.ts
 * Covers findBoardCard and executeAction for all EffectAction types.
 */

import { describe, it, expect } from "vitest";
import { findBoardCard, executeAction } from "../effects/operations.js";
import type { GameState, BoardCard, SpellTrapCard } from "../types/state.js";
import type { EffectAction } from "../types/cards.js";
import type { EngineConfig } from "../types/config.js";

// ── Helpers ───────────────────────────────────────────────────────

const DEFAULT_CONFIG: EngineConfig = {
  startingLP: 8000,
  deckSize: { min: 40, max: 60 },
  maxHandSize: 7,
  maxBoardSlots: 3,
  maxSpellTrapSlots: 3,
  startingHandSize: 5,
  breakdownThreshold: 3,
  maxBreakdownsToWin: 3,
};

function createMinimalState(overrides: Partial<GameState> = {}): GameState {
  return {
    config: DEFAULT_CONFIG,
    cardLookup: {},
    instanceToDefinition: {},
    hostId: "host-player",
    awayId: "away-player",
    hostHand: [],
    awayHand: [],
    hostBoard: [],
    awayBoard: [],
    hostSpellTrapZone: [],
    awaySpellTrapZone: [],
    hostFieldSpell: null,
    awayFieldSpell: null,
    hostDeck: [],
    awayDeck: [],
    hostGraveyard: [],
    awayGraveyard: [],
    hostBanished: [],
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
    currentChainPasser: null,
    pendingAction: null,
    temporaryModifiers: [],
    lingeringEffects: [],
    optUsedThisTurn: [],
    hoptUsedEffects: [],
    winner: null,
    winReason: null,
    gameOver: false,
    gameStarted: true,
    pendingPong: null,
    pendingRedemption: null,
    redemptionUsed: { host: false, away: false },
    costModifiers: [],
    turnRestrictions: [],
    topDeckView: { host: null, away: null },
    ...overrides,
  };
}

function createBoardCard(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    cardId: "card-1",
    definitionId: "def-1",
    position: "attack",
    faceDown: false,
    canAttack: true,
    hasAttackedThisTurn: false,
    changedPositionThisTurn: false,
    viceCounters: 0,
    temporaryBoosts: { attack: 0, defense: 0 },
    equippedCards: [],
    turnSummoned: 1,
    ...overrides,
  };
}

function createSpellTrapCard(overrides: Partial<SpellTrapCard> = {}): SpellTrapCard {
  return {
    cardId: "spell-1",
    definitionId: "spell-def-1",
    faceDown: false,
    activated: false,
    ...overrides,
  };
}

// ── findBoardCard ─────────────────────────────────────────────────

describe("findBoardCard", () => {
  it("finds a card on the host board", () => {
    const card = createBoardCard({ cardId: "host-monster-1" });
    const state = createMinimalState({ hostBoard: [card] });

    const result = findBoardCard(state, "host-monster-1");

    expect(result).not.toBeNull();
    expect(result?.card).toBe(card);
    expect(result?.seat).toBe("host");
  });

  it("finds a card on the away board", () => {
    const card = createBoardCard({ cardId: "away-monster-1" });
    const state = createMinimalState({ awayBoard: [card] });

    const result = findBoardCard(state, "away-monster-1");

    expect(result).not.toBeNull();
    expect(result?.card).toBe(card);
    expect(result?.seat).toBe("away");
  });

  it("returns null when card is not on either board", () => {
    const card = createBoardCard({ cardId: "host-monster-1" });
    const state = createMinimalState({ hostBoard: [card] });

    const result = findBoardCard(state, "nonexistent-card");

    expect(result).toBeNull();
  });

  it("prefers host board when same cardId exists on both (edge case)", () => {
    // In practice cardIds are unique, but we verify search order
    const hostCard = createBoardCard({ cardId: "shared-id", definitionId: "def-host" });
    const awayCard = createBoardCard({ cardId: "shared-id", definitionId: "def-away" });
    const state = createMinimalState({ hostBoard: [hostCard], awayBoard: [awayCard] });

    const result = findBoardCard(state, "shared-id");

    expect(result?.seat).toBe("host");
    expect(result?.card.definitionId).toBe("def-host");
  });
});

// ── executeAction: destroy ────────────────────────────────────────

describe("executeAction: destroy all_opponent_monsters", () => {
  it("destroys all opponent monsters when host is activating player", () => {
    const monster1 = createBoardCard({ cardId: "away-m1" });
    const monster2 = createBoardCard({ cardId: "away-m2" });
    const state = createMinimalState({ awayBoard: [monster1, monster2] });
    const action: EffectAction = { type: "destroy", target: "all_opponent_monsters" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ type: "CARD_DESTROYED", cardId: "away-m1", reason: "effect" });
    expect(events[1]).toEqual({ type: "CARD_SENT_TO_GRAVEYARD", cardId: "away-m1", from: "board", sourceSeat: "away" });
    expect(events[2]).toEqual({ type: "CARD_DESTROYED", cardId: "away-m2", reason: "effect" });
    expect(events[3]).toEqual({ type: "CARD_SENT_TO_GRAVEYARD", cardId: "away-m2", from: "board", sourceSeat: "away" });
  });

  it("destroys all opponent monsters when away is activating player (targets host board)", () => {
    const monster1 = createBoardCard({ cardId: "host-m1" });
    const state = createMinimalState({ hostBoard: [monster1] });
    const action: EffectAction = { type: "destroy", target: "all_opponent_monsters" };

    const events = executeAction(state, action, "away", "source-card", []);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "CARD_DESTROYED", cardId: "host-m1", reason: "effect" });
    expect(events[1]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "host-m1",
      from: "board",
      sourceSeat: "host",
    });
  });

  it("returns empty array when opponent board is empty", () => {
    const state = createMinimalState({ awayBoard: [] });
    const action: EffectAction = { type: "destroy", target: "all_opponent_monsters" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(0);
  });
});

describe("executeAction: destroy all_spells_traps", () => {
  it("destroys opponent spell/trap zone and field spell", () => {
    const trap = createSpellTrapCard({ cardId: "away-trap-1" });
    const field = createSpellTrapCard({ cardId: "away-field-1", isFieldSpell: true });
    const state = createMinimalState({
      awaySpellTrapZone: [trap],
      awayFieldSpell: field,
    });
    const action: EffectAction = { type: "destroy", target: "all_spells_traps" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ type: "CARD_DESTROYED", cardId: "away-trap-1", reason: "effect" });
    expect(events[1]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "away-trap-1",
      from: "spell_trap_zone",
      sourceSeat: "away",
    });
    expect(events[2]).toEqual({ type: "CARD_DESTROYED", cardId: "away-field-1", reason: "effect" });
    expect(events[3]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "away-field-1",
      from: "field",
      sourceSeat: "away",
    });
  });

  it("destroys host spells/traps when away is activating player", () => {
    const spell = createSpellTrapCard({ cardId: "host-spell-1" });
    const state = createMinimalState({ hostSpellTrapZone: [spell] });
    const action: EffectAction = { type: "destroy", target: "all_spells_traps" };

    const events = executeAction(state, action, "away", "source-card", []);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ sourceSeat: "host" });
  });

  it("skips field spell event when no field spell present", () => {
    const trap = createSpellTrapCard({ cardId: "away-trap-1" });
    const state = createMinimalState({
      awaySpellTrapZone: [trap],
      awayFieldSpell: null,
    });
    const action: EffectAction = { type: "destroy", target: "all_spells_traps" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(2);
  });
});

describe("executeAction: destroy selected", () => {
  it("destroys a selected monster on the board with correct sourceSeat", () => {
    const monster = createBoardCard({ cardId: "host-m1" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "destroy", target: "selected" };

    const events = executeAction(state, action, "away", "source-card", ["host-m1"]);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "CARD_DESTROYED", cardId: "host-m1", reason: "effect" });
    expect(events[1]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "host-m1",
      from: "board",
      sourceSeat: "host",
    });
  });

  it("destroys a selected spell/trap with correct sourceSeat", () => {
    const trap = createSpellTrapCard({ cardId: "away-trap-1" });
    const state = createMinimalState({ awaySpellTrapZone: [trap] });
    const action: EffectAction = { type: "destroy", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["away-trap-1"]);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "CARD_DESTROYED", cardId: "away-trap-1", reason: "effect" });
    expect(events[1]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "away-trap-1",
      from: "spell_trap_zone",
      sourceSeat: "away",
    });
  });

  it("returns no events for a nonexistent target", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "destroy", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["ghost-card"]);

    expect(events).toHaveLength(0);
  });

  it("returns no events when targets array is empty", () => {
    const monster = createBoardCard({ cardId: "host-m1" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "destroy", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(0);
  });
});

// ── executeAction: draw ───────────────────────────────────────────

describe("executeAction: draw", () => {
  it("draws the specified number of cards when deck has enough", () => {
    const state = createMinimalState({ hostDeck: ["c1", "c2", "c3", "c4", "c5"] });
    const action: EffectAction = { type: "draw", count: 2 };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "CARD_DRAWN", seat: "host", cardId: "c1" });
    expect(events[1]).toEqual({ type: "CARD_DRAWN", seat: "host", cardId: "c2" });
  });

  it("draws only available cards when count exceeds deck size", () => {
    const state = createMinimalState({ hostDeck: ["c1"] });
    const action: EffectAction = { type: "draw", count: 3 };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "CARD_DRAWN", seat: "host", cardId: "c1" });
  });

  it("returns no events when deck is empty", () => {
    const state = createMinimalState({ hostDeck: [] });
    const action: EffectAction = { type: "draw", count: 2 };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(0);
  });

  it("draws from away deck when away player activates", () => {
    const state = createMinimalState({ awayDeck: ["a1", "a2"] });
    const action: EffectAction = { type: "draw", count: 2 };

    const events = executeAction(state, action, "away", "source-card", []);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "CARD_DRAWN", seat: "away", cardId: "a1" });
    expect(events[1]).toEqual({ type: "CARD_DRAWN", seat: "away", cardId: "a2" });
  });
});

// ── executeAction: damage ─────────────────────────────────────────

describe("executeAction: damage", () => {
  it("deals damage to the opponent when target is opponent and host activates", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "damage", amount: 500, target: "opponent" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "DAMAGE_DEALT", seat: "away", amount: 500, isBattle: false });
  });

  it("deals damage to host when target is opponent and away activates", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "damage", amount: 800, target: "opponent" };

    const events = executeAction(state, action, "away", "source-card", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "DAMAGE_DEALT", seat: "host", amount: 800, isBattle: false });
  });
});

// ── executeAction: heal ───────────────────────────────────────────

describe("executeAction: heal", () => {
  it("heals self by emitting negative DAMAGE_DEALT to activating player", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "heal", amount: 1000, target: "self" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "DAMAGE_DEALT", seat: "host", amount: -1000, isBattle: false });
  });

  it("heals opponent by emitting negative DAMAGE_DEALT to opponent seat", () => {
    const state = createMinimalState();
    // target: "self" on heal means target === "self" → activating player
    // but according to executeHeal: "self" → activating, anything else → opponent
    // We test self only since the EffectAction type only allows target: "self"
    const action: EffectAction = { type: "heal", amount: 500, target: "self" };

    const events = executeAction(state, action, "away", "source-card", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "DAMAGE_DEALT", seat: "away", amount: -500, isBattle: false });
  });
});

// ── executeAction: boost_attack ───────────────────────────────────

describe("executeAction: boost_attack", () => {
  it("boosts an explicit target on the board", () => {
    const monster = createBoardCard({ cardId: "host-m1" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "boost_attack", amount: 500, duration: "turn" };

    const events = executeAction(state, action, "host", "source-spell", ["host-m1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "MODIFIER_APPLIED",
      cardId: "host-m1",
      field: "attack",
      amount: 500,
      source: "source-spell",
      expiresAt: "end_of_turn",
    });
  });

  it("boosts the source card itself when it is on the board and no explicit targets", () => {
    const monster = createBoardCard({ cardId: "host-m1" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "boost_attack", amount: 300, duration: "permanent" };

    const events = executeAction(state, action, "host", "host-m1", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "MODIFIER_APPLIED",
      cardId: "host-m1",
      field: "attack",
      amount: 300,
      expiresAt: "permanent",
    });
  });

  it("auto-targets all friendly monsters when source card is not on the board (spell case)", () => {
    const m1 = createBoardCard({ cardId: "host-m1" });
    const m2 = createBoardCard({ cardId: "host-m2" });
    const state = createMinimalState({ hostBoard: [m1, m2] });
    const action: EffectAction = { type: "boost_attack", amount: 200, duration: "turn" };

    // source-spell is a spell card, not on the board
    const events = executeAction(state, action, "host", "source-spell", []);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "MODIFIER_APPLIED", cardId: "host-m1", field: "attack", amount: 200 });
    expect(events[1]).toMatchObject({ type: "MODIFIER_APPLIED", cardId: "host-m2", field: "attack", amount: 200 });
  });

  it("auto-targets all friendly away monsters when away is activating and source not on board", () => {
    const m1 = createBoardCard({ cardId: "away-m1" });
    const state = createMinimalState({ awayBoard: [m1] });
    const action: EffectAction = { type: "boost_attack", amount: 400, duration: "permanent" };

    const events = executeAction(state, action, "away", "away-spell", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ cardId: "away-m1" });
  });

  it("returns no events when explicit target is not on the board", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "boost_attack", amount: 500, duration: "turn" };

    const events = executeAction(state, action, "host", "source-card", ["ghost-card"]);

    expect(events).toHaveLength(0);
  });

  it("uses end_of_turn expiresAt for turn duration", () => {
    const monster = createBoardCard({ cardId: "m1" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "boost_attack", amount: 100, duration: "turn" };

    const events = executeAction(state, action, "host", "source", ["m1"]);

    expect((events[0] as { expiresAt: string }).expiresAt).toBe("end_of_turn");
  });

  it("uses permanent expiresAt for permanent duration", () => {
    const monster = createBoardCard({ cardId: "m1" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "boost_attack", amount: 100, duration: "permanent" };

    const events = executeAction(state, action, "host", "source", ["m1"]);

    expect((events[0] as { expiresAt: string }).expiresAt).toBe("permanent");
  });
});

// ── executeAction: boost_defense ─────────────────────────────────

describe("executeAction: boost_defense", () => {
  it("boosts an explicit target's defense on the board", () => {
    const monster = createBoardCard({ cardId: "host-m1" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "boost_defense", amount: 600, duration: "turn" };

    const events = executeAction(state, action, "host", "source-spell", ["host-m1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "MODIFIER_APPLIED",
      cardId: "host-m1",
      field: "defense",
      amount: 600,
      source: "source-spell",
      expiresAt: "end_of_turn",
    });
  });

  it("boosts source card's defense when source is on the board and no explicit targets", () => {
    const monster = createBoardCard({ cardId: "m1" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "boost_defense", amount: 400, duration: "permanent" };

    const events = executeAction(state, action, "host", "m1", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ field: "defense", cardId: "m1", expiresAt: "permanent" });
  });

  it("auto-targets all friendly monsters when source card is not on the board", () => {
    const m1 = createBoardCard({ cardId: "host-m1" });
    const m2 = createBoardCard({ cardId: "host-m2" });
    const state = createMinimalState({ hostBoard: [m1, m2] });
    const action: EffectAction = { type: "boost_defense", amount: 150, duration: "turn" };

    const events = executeAction(state, action, "host", "source-spell", []);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ field: "defense", cardId: "host-m1" });
    expect(events[1]).toMatchObject({ field: "defense", cardId: "host-m2" });
  });

  it("auto-targets all friendly away monsters when away is activating and source not on board", () => {
    const m1 = createBoardCard({ cardId: "away-m1" });
    const state = createMinimalState({ awayBoard: [m1] });
    const action: EffectAction = { type: "boost_defense", amount: 300, duration: "permanent" };

    const events = executeAction(state, action, "away", "away-spell", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ field: "defense", cardId: "away-m1" });
  });

  it("returns no events when explicit target is not on the board", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "boost_defense", amount: 500, duration: "turn" };

    const events = executeAction(state, action, "host", "source-card", ["ghost-card"]);

    expect(events).toHaveLength(0);
  });

  it("uses permanent expiresAt for permanent duration", () => {
    const monster = createBoardCard({ cardId: "m1" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "boost_defense", amount: 200, duration: "permanent" };

    const events = executeAction(state, action, "host", "source", ["m1"]);

    expect((events[0] as { expiresAt: string }).expiresAt).toBe("permanent");
  });
});

// ── executeAction: add_vice ───────────────────────────────────────

describe("executeAction: add_vice", () => {
  it("adds vice counters to a target on the board", () => {
    const monster = createBoardCard({ cardId: "away-m1", viceCounters: 0 });
    const state = createMinimalState({ awayBoard: [monster] });
    const action: EffectAction = { type: "add_vice", count: 2, target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["away-m1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "VICE_COUNTER_ADDED", cardId: "away-m1", newCount: 2 });
  });

  it("adds to existing vice counter value", () => {
    const monster = createBoardCard({ cardId: "m1", viceCounters: 3 });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "add_vice", count: 2, target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["m1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "VICE_COUNTER_ADDED", cardId: "m1", newCount: 5 });
  });

  it("returns no events when target is not on the board", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "add_vice", count: 1, target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["ghost-card"]);

    expect(events).toHaveLength(0);
  });
});

// ── executeAction: remove_vice ────────────────────────────────────

describe("executeAction: remove_vice", () => {
  it("removes vice counters from a target on the board", () => {
    const monster = createBoardCard({ cardId: "m1", viceCounters: 3 });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "remove_vice", count: 2, target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["m1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "VICE_COUNTER_REMOVED", cardId: "m1", newCount: 1 });
  });

  it("clamps to 0 and does not go negative", () => {
    const monster = createBoardCard({ cardId: "m1", viceCounters: 1 });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "remove_vice", count: 5, target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["m1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "VICE_COUNTER_REMOVED", cardId: "m1", newCount: 0 });
  });

  it("returns no events when target is not on the board", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "remove_vice", count: 1, target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["ghost-card"]);

    expect(events).toHaveLength(0);
  });
});

// ── executeAction: banish ─────────────────────────────────────────

describe("executeAction: banish", () => {
  it("banishes a card from the board with sourceSeat from board detection", () => {
    const monster = createBoardCard({ cardId: "host-m1" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "banish", target: "selected" };

    const events = executeAction(state, action, "away", "source-card", ["host-m1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "CARD_BANISHED", cardId: "host-m1", from: "board", sourceSeat: "host" });
  });

  it("banishes a card from host hand with correct sourceSeat", () => {
    const state = createMinimalState({ hostHand: ["hand-card-1"] });
    const action: EffectAction = { type: "banish", target: "selected" };

    const events = executeAction(state, action, "away", "source-card", ["hand-card-1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "CARD_BANISHED", cardId: "hand-card-1", from: "hand", sourceSeat: "host" });
  });

  it("banishes a card from away hand with correct sourceSeat", () => {
    const state = createMinimalState({ awayHand: ["hand-card-2"] });
    const action: EffectAction = { type: "banish", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["hand-card-2"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "CARD_BANISHED", cardId: "hand-card-2", from: "hand", sourceSeat: "away" });
  });

  it("banishes a card from host graveyard with correct sourceSeat", () => {
    const state = createMinimalState({ hostGraveyard: ["gy-card-1"] });
    const action: EffectAction = { type: "banish", target: "selected" };

    const events = executeAction(state, action, "away", "source-card", ["gy-card-1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "CARD_BANISHED", cardId: "gy-card-1", from: "graveyard", sourceSeat: "host" });
  });

  it("banishes a card from away graveyard with correct sourceSeat", () => {
    const state = createMinimalState({ awayGraveyard: ["gy-card-2"] });
    const action: EffectAction = { type: "banish", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["gy-card-2"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "CARD_BANISHED", cardId: "gy-card-2", from: "graveyard", sourceSeat: "away" });
  });

  it("banishes a card from host banished zone with correct sourceSeat", () => {
    // Re-banishing an already banished card
    const state = createMinimalState({ hostBanished: ["ban-card-1"] });
    const action: EffectAction = { type: "banish", target: "selected" };

    const events = executeAction(state, action, "away", "source-card", ["ban-card-1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "CARD_BANISHED", cardId: "ban-card-1", from: "banished", sourceSeat: "host" });
  });

  it("banishes a card from away banished zone with correct sourceSeat", () => {
    const state = createMinimalState({ awayBanished: ["ban-card-2"] });
    const action: EffectAction = { type: "banish", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["ban-card-2"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "CARD_BANISHED", cardId: "ban-card-2", from: "banished", sourceSeat: "away" });
  });

  it("banishes a card from spell_trap_zone with correct sourceSeat", () => {
    const trap = createSpellTrapCard({ cardId: "away-trap-1" });
    const state = createMinimalState({ awaySpellTrapZone: [trap] });
    const action: EffectAction = { type: "banish", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["away-trap-1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "CARD_BANISHED",
      cardId: "away-trap-1",
      from: "spell_trap_zone",
      sourceSeat: "away",
    });
  });

  it("skips (no events) when card is in deck", () => {
    const state = createMinimalState({ hostDeck: ["deck-card-1"] });
    const action: EffectAction = { type: "banish", target: "selected" };

    const events = executeAction(state, action, "away", "source-card", ["deck-card-1"]);

    expect(events).toHaveLength(0);
  });

  it("skips when card is in away deck", () => {
    const state = createMinimalState({ awayDeck: ["away-deck-1"] });
    const action: EffectAction = { type: "banish", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["away-deck-1"]);

    expect(events).toHaveLength(0);
  });

  it("returns no events when card is not found anywhere", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "banish", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["ghost-card"]);

    expect(events).toHaveLength(0);
  });
});

// ── executeAction: return_to_hand ─────────────────────────────────

describe("executeAction: return_to_hand", () => {
  it("returns a card from the board to hand", () => {
    const monster = createBoardCard({ cardId: "away-m1" });
    const state = createMinimalState({ awayBoard: [monster] });
    const action: EffectAction = { type: "return_to_hand", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["away-m1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "CARD_RETURNED_TO_HAND",
      cardId: "away-m1",
      from: "board",
      sourceSeat: "away",
    });
  });

  it("returns a card from the graveyard to hand with correct sourceSeat", () => {
    const state = createMinimalState({ hostGraveyard: ["gy-card-1"] });
    const action: EffectAction = { type: "return_to_hand", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["gy-card-1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "CARD_RETURNED_TO_HAND",
      cardId: "gy-card-1",
      from: "graveyard",
      sourceSeat: "host",
    });
  });

  it("returns a card from away graveyard with correct sourceSeat", () => {
    const state = createMinimalState({ awayGraveyard: ["gy-card-2"] });
    const action: EffectAction = { type: "return_to_hand", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["gy-card-2"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sourceSeat: "away", from: "graveyard" });
  });

  it("skips cards in deck (no events)", () => {
    const state = createMinimalState({ hostDeck: ["deck-card-1"] });
    const action: EffectAction = { type: "return_to_hand", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["deck-card-1"]);

    expect(events).toHaveLength(0);
  });

  it("returns no events when card is not found", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "return_to_hand", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["ghost-card"]);

    expect(events).toHaveLength(0);
  });
});

// ── executeAction: discard ────────────────────────────────────────

describe("executeAction: discard", () => {
  it("discards from the end of opponent hand when target is opponent and host activates", () => {
    const state = createMinimalState({ awayHand: ["a1", "a2", "a3"] });
    const action: EffectAction = { type: "discard", count: 2, target: "opponent" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(2);
    // discards from end: index 2 first, then index 1
    expect(events[0]).toEqual({ type: "CARD_SENT_TO_GRAVEYARD", cardId: "a3", from: "hand", sourceSeat: "away" });
    expect(events[1]).toEqual({ type: "CARD_SENT_TO_GRAVEYARD", cardId: "a2", from: "hand", sourceSeat: "away" });
  });

  it("discards from host hand when target is opponent and away activates", () => {
    const state = createMinimalState({ hostHand: ["h1", "h2"] });
    const action: EffectAction = { type: "discard", count: 1, target: "opponent" };

    const events = executeAction(state, action, "away", "source-card", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "CARD_SENT_TO_GRAVEYARD", cardId: "h2", from: "hand", sourceSeat: "host" });
  });

  it("discards only available cards when count exceeds hand size", () => {
    const state = createMinimalState({ awayHand: ["a1"] });
    const action: EffectAction = { type: "discard", count: 3, target: "opponent" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ cardId: "a1" });
  });

  it("returns no events when opponent hand is empty", () => {
    const state = createMinimalState({ awayHand: [] });
    const action: EffectAction = { type: "discard", count: 2, target: "opponent" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(0);
  });
});

// ── executeAction: special_summon ─────────────────────────────────

describe("executeAction: special_summon", () => {
  it("special summons a card from hand when card is in hand", () => {
    const state = createMinimalState({ hostHand: ["monster-1"] });
    const action: EffectAction = { type: "special_summon", from: "hand" };

    const events = executeAction(state, action, "host", "source-card", ["monster-1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "SPECIAL_SUMMONED",
      seat: "host",
      cardId: "monster-1",
      from: "hand",
      position: "attack",
    });
  });

  it("special summons a card from graveyard", () => {
    const state = createMinimalState({ hostGraveyard: ["monster-2"] });
    const action: EffectAction = { type: "special_summon", from: "graveyard" };

    const events = executeAction(state, action, "host", "source-card", ["monster-2"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "SPECIAL_SUMMONED", cardId: "monster-2", from: "graveyard" });
  });

  it("does not special summon when card is in wrong zone (action.from mismatch)", () => {
    // Card is in graveyard but action says from: "hand"
    const state = createMinimalState({ hostGraveyard: ["monster-3"] });
    const action: EffectAction = { type: "special_summon", from: "hand" };

    const events = executeAction(state, action, "host", "source-card", ["monster-3"]);

    expect(events).toHaveLength(0);
  });

  it("returns no events when card is not found anywhere", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "special_summon", from: "hand" };

    const events = executeAction(state, action, "host", "source-card", ["ghost-card"]);

    expect(events).toHaveLength(0);
  });

  it("special summons using away player seat when away activates", () => {
    const state = createMinimalState({ awayGraveyard: ["monster-4"] });
    const action: EffectAction = { type: "special_summon", from: "graveyard" };

    const events = executeAction(state, action, "away", "source-card", ["monster-4"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ seat: "away" });
  });
});

// ── executeAction: change_position ───────────────────────────────

describe("executeAction: change_position", () => {
  it("changes position from attack to defense", () => {
    const monster = createBoardCard({ cardId: "m1", position: "attack" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "change_position", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["m1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "POSITION_CHANGED", cardId: "m1", from: "attack", to: "defense" });
  });

  it("changes position from defense to attack", () => {
    const monster = createBoardCard({ cardId: "m1", position: "defense" });
    const state = createMinimalState({ hostBoard: [monster] });
    const action: EffectAction = { type: "change_position", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["m1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "POSITION_CHANGED", cardId: "m1", from: "defense", to: "attack" });
  });

  it("returns no events when target card is not on the board", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "change_position", target: "selected" };

    const events = executeAction(state, action, "host", "source-card", ["ghost-card"]);

    expect(events).toHaveLength(0);
  });

  it("changes position for an away monster", () => {
    const monster = createBoardCard({ cardId: "away-m1", position: "defense" });
    const state = createMinimalState({ awayBoard: [monster] });
    const action: EffectAction = { type: "change_position", target: "selected" };

    const events = executeAction(state, action, "away", "source-card", ["away-m1"]);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "POSITION_CHANGED", cardId: "away-m1", from: "defense", to: "attack" });
  });
});

// ── executeAction: negate ─────────────────────────────────────────

describe("executeAction: negate", () => {
  it("returns empty array (no-op)", () => {
    const state = createMinimalState();
    const action: EffectAction = { type: "negate", target: "last_chain_link" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(0);
  });
});

describe("executeAction: modify_cost", () => {
  it("emits COST_MODIFIER_APPLIED for both seats when target is both", () => {
    const state = createMinimalState();
    const action: EffectAction = {
      type: "modify_cost",
      cardType: "spell",
      operation: "set",
      amount: 0,
      target: "both",
      durationTurns: 1,
    };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toEqual([
      {
        type: "COST_MODIFIER_APPLIED",
        seat: "host",
        cardType: "spell",
        operation: "set",
        amount: 0,
        sourceCardId: "source-card",
        durationTurns: 1,
      },
      {
        type: "COST_MODIFIER_APPLIED",
        seat: "away",
        cardType: "spell",
        operation: "set",
        amount: 0,
        sourceCardId: "source-card",
        durationTurns: 1,
      },
    ]);
  });
});

describe("executeAction: view_top_cards / rearrange_top_cards", () => {
  it("emits top-deck visibility event", () => {
    const state = createMinimalState({
      hostDeck: ["h1", "h2", "h3", "h4"],
    });
    const action: EffectAction = { type: "view_top_cards", count: 3 };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toEqual([
      {
        type: "TOP_CARDS_VIEWED",
        seat: "host",
        cardIds: ["h1", "h2", "h3"],
        sourceCardId: "source-card",
      },
    ]);
  });

  it("emits deterministic reorder event", () => {
    const state = createMinimalState({
      hostDeck: ["h1", "h2", "h3", "h4"],
    });
    const action: EffectAction = { type: "rearrange_top_cards", count: 3, strategy: "reverse" };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toEqual([
      {
        type: "TOP_CARDS_REARRANGED",
        seat: "host",
        cardIds: ["h3", "h2", "h1"],
        sourceCardId: "source-card",
      },
    ]);
  });
});

describe("executeAction: apply_restriction", () => {
  it("emits TURN_RESTRICTION_APPLIED with derived seat", () => {
    const state = createMinimalState();
    const action: EffectAction = {
      type: "apply_restriction",
      restriction: "disable_attacks",
      target: "opponent",
      durationTurns: 2,
    };

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toEqual([
      {
        type: "TURN_RESTRICTION_APPLIED",
        seat: "away",
        restriction: "disable_attacks",
        sourceCardId: "source-card",
        durationTurns: 2,
      },
    ]);
  });
});

// ── executeAction: unknown type ───────────────────────────────────

describe("executeAction: unknown type", () => {
  it("returns empty array for an unknown action type", () => {
    const state = createMinimalState();
    // Cast to bypass type safety to simulate an unknown/future action type
    const action = { type: "some_unknown_action", amount: 100 } as unknown as EffectAction;

    const events = executeAction(state, action, "host", "source-card", []);

    expect(events).toHaveLength(0);
  });
});
