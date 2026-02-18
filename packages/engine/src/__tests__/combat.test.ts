import { describe, it, expect } from "vitest";
import { createEngine, createInitialState } from "../engine.js";
import type { GameState, BoardCard } from "../types/state.js";
import type { CardDefinition } from "../types/cards.js";
import { DEFAULT_CONFIG } from "../types/config.js";

describe("Combat", () => {
  const cardLookup: Record<string, CardDefinition> = {
    monster1: {
      id: "monster1",
      name: "Test Monster 1",
      type: "stereotype",
      description: "A test monster",
      rarity: "common",
      attack: 1500,
      defense: 1000,
      level: 4,
      attribute: "fire",
    },
    monster2: {
      id: "monster2",
      name: "Test Monster 2",
      type: "stereotype",
      description: "A test monster",
      rarity: "common",
      attack: 1800,
      defense: 1200,
      level: 4,
      attribute: "water",
    },
    monster3: {
      id: "monster3",
      name: "Test Monster 3",
      type: "stereotype",
      description: "A test monster",
      rarity: "common",
      attack: 1500,
      defense: 2000,
      level: 4,
      attribute: "earth",
    },
    weakMonster: {
      id: "weakMonster",
      name: "Weak Monster",
      type: "stereotype",
      description: "A weak monster",
      rarity: "common",
      attack: 500,
      defense: 300,
      level: 2,
      attribute: "wind",
    },
  };

  function createCombatState(): GameState {
    return createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "host-player",
      "away-player",
      ["monster1", "monster2"],
      ["monster3", "weakMonster"],
      "host"
    );
  }

  function addMonsterToBoard(
    state: GameState,
    seat: "host" | "away",
    cardId: string,
    position: "attack" | "defense",
    faceDown: boolean = false,
    canAttack: boolean = true,
    hasAttackedThisTurn: boolean = false
  ): GameState {
    const newState = { ...state };
    const board = seat === "host" ? [...newState.hostBoard] : [...newState.awayBoard];

    const newCard: BoardCard = {
      cardId,
      definitionId: cardId,
      position,
      faceDown,
      canAttack,
      hasAttackedThisTurn,
      changedPositionThisTurn: false,
      viceCounters: 0,
      temporaryBoosts: { attack: 0, defense: 0 },
      equippedCards: [],
      turnSummoned: 1,
    };

    board.push(newCard);

    if (seat === "host") {
      newState.hostBoard = board;
    } else {
      newState.awayBoard = board;
    }

    return newState;
  }

  it("Direct attack deals damage equal to ATK", () => {
    let state = createCombatState();
    state.currentPhase = "combat";
    state.turnNumber = 2;

    // Add a monster to host's board
    state = addMonsterToBoard(state, "host", "monster1", "attack");

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    // Override state
    engine.evolve([]);
    Object.assign(engine.getState(), state);

    // Declare direct attack
    const events = engine.decide({ type: "DECLARE_ATTACK", attackerId: "monster1" }, "host");

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      type: "ATTACK_DECLARED",
      seat: "host",
      attackerId: "monster1",
      targetId: null,
    });
    expect(events[1]).toEqual({
      type: "DAMAGE_DEALT",
      seat: "away",
      amount: 1500,
      isBattle: true,
    });
    expect(events[2]).toEqual({
      type: "BATTLE_RESOLVED",
      attackerId: "monster1",
      defenderId: null,
      result: "win",
    });

    // Apply events
    engine.evolve(events);
    const newState = engine.getState();

    expect(newState.awayLifePoints).toBe(DEFAULT_CONFIG.startingLP - 1500);
    expect(newState.hostBoard[0].hasAttackedThisTurn).toBe(true);
  });

  it("Attack vs attack - attacker wins, defender destroyed", () => {
    let state = createCombatState();
    state.currentPhase = "combat";
    state.turnNumber = 2;

    // Host has stronger monster (1800 ATK)
    state = addMonsterToBoard(state, "host", "monster2", "attack");
    // Away has weaker monster (1500 ATK)
    state = addMonsterToBoard(state, "away", "monster1", "attack");

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);

    const events = engine.decide({ type: "DECLARE_ATTACK", attackerId: "monster2", targetId: "monster1" }, "host");

    expect(events).toHaveLength(5);
    expect(events[0]).toEqual({
      type: "ATTACK_DECLARED",
      seat: "host",
      attackerId: "monster2",
      targetId: "monster1",
    });
    expect(events[1]).toEqual({
      type: "CARD_DESTROYED",
      cardId: "monster1",
      reason: "battle",
    });
    expect(events[2]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "monster1",
      from: "board",
      sourceSeat: "away",
    });
    expect(events[3]).toEqual({
      type: "DAMAGE_DEALT",
      seat: "away",
      amount: 300, // 1800 - 1500
      isBattle: true,
    });
    expect(events[4]).toEqual({
      type: "BATTLE_RESOLVED",
      attackerId: "monster2",
      defenderId: "monster1",
      result: "win",
    });

    engine.evolve(events);
    const newState = engine.getState();

    expect(newState.awayLifePoints).toBe(DEFAULT_CONFIG.startingLP - 300);
    expect(newState.awayBoard).toHaveLength(0);
    expect(newState.awayGraveyard).toContain("monster1");
  });

  it("Attack vs attack - defender wins, attacker destroyed", () => {
    let state = createCombatState();
    state.currentPhase = "combat";
    state.turnNumber = 2;

    // Host has weaker monster (500 ATK)
    state = addMonsterToBoard(state, "host", "weakMonster", "attack");
    // Away has stronger monster (1500 ATK)
    state = addMonsterToBoard(state, "away", "monster1", "attack");

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);

    const events = engine.decide({ type: "DECLARE_ATTACK", attackerId: "weakMonster", targetId: "monster1" }, "host");

    expect(events).toHaveLength(5);
    expect(events[0]).toEqual({
      type: "ATTACK_DECLARED",
      seat: "host",
      attackerId: "weakMonster",
      targetId: "monster1",
    });
    expect(events[1]).toEqual({
      type: "CARD_DESTROYED",
      cardId: "weakMonster",
      reason: "battle",
    });
    expect(events[2]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "weakMonster",
      from: "board",
      sourceSeat: "host",
    });
    expect(events[3]).toEqual({
      type: "DAMAGE_DEALT",
      seat: "host",
      amount: 1000, // 1500 - 500
      isBattle: true,
    });
    expect(events[4]).toEqual({
      type: "BATTLE_RESOLVED",
      attackerId: "weakMonster",
      defenderId: "monster1",
      result: "lose",
    });

    engine.evolve(events);
    const newState = engine.getState();

    expect(newState.hostLifePoints).toBe(DEFAULT_CONFIG.startingLP - 1000);
    expect(newState.hostBoard).toHaveLength(0);
    expect(newState.hostGraveyard).toContain("weakMonster");
  });

  it("Attack vs attack - draw, both destroyed", () => {
    let state = createCombatState();
    state.currentPhase = "combat";
    state.turnNumber = 2;

    // Both monsters have 1500 ATK
    state = addMonsterToBoard(state, "host", "monster1", "attack");
    state = addMonsterToBoard(state, "away", "monster3", "attack");

    // Override monster3 attack to match monster1
    cardLookup.monster3.attack = 1500;

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);

    const events = engine.decide({ type: "DECLARE_ATTACK", attackerId: "monster1", targetId: "monster3" }, "host");

    expect(events).toHaveLength(6);
    expect(events[0]).toEqual({
      type: "ATTACK_DECLARED",
      seat: "host",
      attackerId: "monster1",
      targetId: "monster3",
    });
    expect(events[1]).toEqual({
      type: "CARD_DESTROYED",
      cardId: "monster1",
      reason: "battle",
    });
    expect(events[2]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "monster1",
      from: "board",
      sourceSeat: "host",
    });
    expect(events[3]).toEqual({
      type: "CARD_DESTROYED",
      cardId: "monster3",
      reason: "battle",
    });
    expect(events[4]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "monster3",
      from: "board",
      sourceSeat: "away",
    });
    expect(events[5]).toEqual({
      type: "BATTLE_RESOLVED",
      attackerId: "monster1",
      defenderId: "monster3",
      result: "draw",
    });

    engine.evolve(events);
    const newState = engine.getState();

    expect(newState.hostBoard).toHaveLength(0);
    expect(newState.awayBoard).toHaveLength(0);
    expect(newState.hostGraveyard).toContain("monster1");
    expect(newState.awayGraveyard).toContain("monster3");
    // Reset for other tests
    cardLookup.monster3.attack = 1500;
  });

  it("Attack vs defense - attacker wins, defender destroyed", () => {
    let state = createCombatState();
    state.currentPhase = "combat";
    state.turnNumber = 2;

    // Host has 1800 ATK
    state = addMonsterToBoard(state, "host", "monster2", "attack");
    // Away has 1200 DEF (monster1 has 1000 DEF)
    state = addMonsterToBoard(state, "away", "monster1", "defense");

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);

    const events = engine.decide({ type: "DECLARE_ATTACK", attackerId: "monster2", targetId: "monster1" }, "host");

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({
      type: "ATTACK_DECLARED",
      seat: "host",
      attackerId: "monster2",
      targetId: "monster1",
    });
    expect(events[1]).toEqual({
      type: "CARD_DESTROYED",
      cardId: "monster1",
      reason: "battle",
    });
    expect(events[2]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "monster1",
      from: "board",
      sourceSeat: "away",
    });
    expect(events[3]).toEqual({
      type: "BATTLE_RESOLVED",
      attackerId: "monster2",
      defenderId: "monster1",
      result: "win",
    });

    engine.evolve(events);
    const newState = engine.getState();

    expect(newState.awayBoard).toHaveLength(0);
    expect(newState.awayGraveyard).toContain("monster1");
    // No damage dealt in defense position
    expect(newState.awayLifePoints).toBe(DEFAULT_CONFIG.startingLP);
  });

  it("Attack vs defense - defender stronger, attacker takes damage", () => {
    let state = createCombatState();
    state.currentPhase = "combat";
    state.turnNumber = 2;

    // Host has 1500 ATK
    state = addMonsterToBoard(state, "host", "monster1", "attack");
    // Away has 2000 DEF
    state = addMonsterToBoard(state, "away", "monster3", "defense");

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);

    const events = engine.decide({ type: "DECLARE_ATTACK", attackerId: "monster1", targetId: "monster3" }, "host");

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      type: "ATTACK_DECLARED",
      seat: "host",
      attackerId: "monster1",
      targetId: "monster3",
    });
    expect(events[1]).toEqual({
      type: "DAMAGE_DEALT",
      seat: "host",
      amount: 500, // 2000 - 1500
      isBattle: true,
    });
    expect(events[2]).toEqual({
      type: "BATTLE_RESOLVED",
      attackerId: "monster1",
      defenderId: "monster3",
      result: "lose",
    });

    engine.evolve(events);
    const newState = engine.getState();

    expect(newState.hostLifePoints).toBe(DEFAULT_CONFIG.startingLP - 500);
    // Both monsters survive
    expect(newState.hostBoard).toHaveLength(1);
    expect(newState.awayBoard).toHaveLength(1);
  });

  it("Cannot attack on turn 1", () => {
    let state = createCombatState();
    state.currentPhase = "combat";
    state.turnNumber = 1; // Turn 1

    state = addMonsterToBoard(state, "host", "monster1", "attack");

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);

    const events = engine.decide({ type: "DECLARE_ATTACK", attackerId: "monster1" }, "host");

    expect(events).toHaveLength(0);
  });

  it("Cannot attack with a monster that already attacked", () => {
    let state = createCombatState();
    state.currentPhase = "combat";
    state.turnNumber = 2;

    state = addMonsterToBoard(state, "host", "monster1", "attack", false, true, true); // hasAttackedThisTurn = true

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);

    const events = engine.decide({ type: "DECLARE_ATTACK", attackerId: "monster1" }, "host");

    expect(events).toHaveLength(0);
  });

  it("Resolves duplicate attacker card IDs when only one instance is attack-eligible", () => {
    let state = createCombatState();
    state.currentPhase = "combat";
    state.turnNumber = 2;

    state = addMonsterToBoard(state, "host", "monster1", "attack", false, true, true);
    state = addMonsterToBoard(state, "host", "monster1", "attack", false, true, false);
    state = addMonsterToBoard(state, "away", "monster2", "attack", false, true, false);

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);

    const events = engine.decide(
      {
        type: "DECLARE_ATTACK",
        attackerId: "monster1",
        targetId: "monster2",
      },
      "host",
    );

    expect(events).toHaveLength(5);
    expect(events[0]).toEqual({
      type: "ATTACK_DECLARED",
      seat: "host",
      attackerId: "monster1",
      targetId: "monster2",
    });

    engine.evolve(events);
    const newState = engine.getState();
    expect(newState.hostBoard).toHaveLength(1);
    expect(newState.hostBoard[0].hasAttackedThisTurn).toBe(true);
  });

  it("Rejects ambiguous duplicate attacker card IDs without explicit slot", () => {
    let state = createCombatState();
    state.currentPhase = "combat";
    state.turnNumber = 2;

    state = addMonsterToBoard(state, "host", "monster1", "attack");
    state = addMonsterToBoard(state, "host", "monster1", "attack");
    state = addMonsterToBoard(state, "away", "monster2", "attack");

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);

    const events = engine.decide(
      {
        type: "DECLARE_ATTACK",
        attackerId: "monster1",
        targetId: "monster2",
      },
      "host",
    );

    expect(events).toHaveLength(0);
  });

  it("Can use explicit attackerSlot to disambiguate duplicate attacker instances", () => {
    let state = createCombatState();
    state.currentPhase = "combat";
    state.turnNumber = 2;

    state = addMonsterToBoard(state, "host", "monster1", "attack", false, true, true);
    state = addMonsterToBoard(state, "host", "monster1", "attack", false, true, false);
    state = addMonsterToBoard(state, "away", "monster2", "attack", false, true, false);

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);

    const events = engine.decide(
      {
        type: "DECLARE_ATTACK",
        attackerId: "monster1",
        attackerSlot: 1,
        targetId: "monster2",
      },
      "host",
    );

    expect(events).toHaveLength(5);
    expect(events[0]).toEqual({
      type: "ATTACK_DECLARED",
      seat: "host",
      attackerId: "monster1",
      targetId: "monster2",
      attackerSlot: 1,
    });
  });

  it("Reject attack when not in combat phase", () => {
    let state = createCombatState();
    state.currentPhase = "main"; // Not combat phase
    state.turnNumber = 2;

    state = addMonsterToBoard(state, "host", "monster1", "attack");

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);

    const events = engine.decide({ type: "DECLARE_ATTACK", attackerId: "monster1" }, "host");

    expect(events).toHaveLength(0);
  });
});
