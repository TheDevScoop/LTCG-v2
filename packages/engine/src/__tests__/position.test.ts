import { describe, it, expect } from "vitest";
import { createEngine } from "../engine.js";
import { defineCards } from "../cards.js";
import type { CardDefinition } from "../types/index.js";

const sampleCards: CardDefinition[] = [
  {
    id: "warrior-1",
    name: "Test Warrior",
    type: "stereotype",
    description: "A test warrior",
    rarity: "common",
    attack: 1500,
    defense: 1200,
    level: 4,
    attribute: "fire",
  },
  {
    id: "spell-1",
    name: "Test Spell",
    type: "spell",
    description: "A test spell",
    rarity: "common",
    spellType: "normal",
  },
];

const cardLookup = defineCards(sampleCards);

function createTestDeck(count: number): string[] {
  return Array(count)
    .fill(null)
    .map((_, i) => (i % 2 === 0 ? "warrior-1" : "spell-1"));
}

describe("CHANGE_POSITION", () => {
  it("changes monster from attack to defense position", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.turnNumber = 2;

    // Add a monster that was summoned last turn
    state.hostBoard = [
      {
        cardId: "monster-1",
        definitionId: "warrior-1",
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

    const events = engine.decide({ type: "CHANGE_POSITION", cardId: "monster-1" }, "host");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "POSITION_CHANGED",
      cardId: "monster-1",
      from: "attack",
      to: "defense",
    });

    // Apply events
    engine.evolve(events);
    const newState = engine.getState();

    expect(newState.hostBoard[0].position).toBe("defense");
    expect(newState.hostBoard[0].changedPositionThisTurn).toBe(true);
  });

  it("changes monster from defense to attack position", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.turnNumber = 2;

    state.hostBoard = [
      {
        cardId: "monster-1",
        definitionId: "warrior-1",
        position: "defense",
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

    const events = engine.decide({ type: "CHANGE_POSITION", cardId: "monster-1" }, "host");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "POSITION_CHANGED",
      cardId: "monster-1",
      from: "defense",
      to: "attack",
    });

    engine.evolve(events);
    const newState = engine.getState();

    expect(newState.hostBoard[0].position).toBe("attack");
    expect(newState.hostBoard[0].changedPositionThisTurn).toBe(true);
  });

  it("rejects changing position twice in one turn", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.turnNumber = 2;

    state.hostBoard = [
      {
        cardId: "monster-1",
        definitionId: "warrior-1",
        position: "attack",
        faceDown: false,
        canAttack: true,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: true, // Already changed position this turn
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
    ];

    const events = engine.decide({ type: "CHANGE_POSITION", cardId: "monster-1" }, "host");

    expect(events).toEqual([]); // No events should be generated
  });

  it("rejects changing position of face-down monster", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.turnNumber = 2;

    state.hostBoard = [
      {
        cardId: "monster-1",
        definitionId: "warrior-1",
        position: "defense",
        faceDown: true, // Face-down
        canAttack: false,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
    ];

    const events = engine.decide({ type: "CHANGE_POSITION", cardId: "monster-1" }, "host");

    expect(events).toEqual([]); // No events should be generated
  });

  it("rejects changing position on the turn summoned", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.turnNumber = 2;

    state.hostBoard = [
      {
        cardId: "monster-1",
        definitionId: "warrior-1",
        position: "attack",
        faceDown: false,
        canAttack: false,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 2, // Summoned this turn
      },
    ];

    const events = engine.decide({ type: "CHANGE_POSITION", cardId: "monster-1" }, "host");

    expect(events).toEqual([]); // No events should be generated
  });

  it("rejects changing position outside main phase", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "combat"; // Not main phase
    state.turnNumber = 2;

    state.hostBoard = [
      {
        cardId: "monster-1",
        definitionId: "warrior-1",
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

    const events = engine.decide({ type: "CHANGE_POSITION", cardId: "monster-1" }, "host");

    expect(events).toEqual([]); // No events should be generated
  });

  it("allows changing position in main2 phase", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main2"; // Main2 phase should work
    state.turnNumber = 2;

    state.hostBoard = [
      {
        cardId: "monster-1",
        definitionId: "warrior-1",
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

    const events = engine.decide({ type: "CHANGE_POSITION", cardId: "monster-1" }, "host");

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("POSITION_CHANGED");
  });

  it("rejects changing position of non-existent card", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.turnNumber = 2;
    state.hostBoard = [];

    const events = engine.decide({ type: "CHANGE_POSITION", cardId: "nonexistent" }, "host");

    expect(events).toEqual([]); // No events should be generated
  });

  it("resets changedPositionThisTurn flag at start of turn", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.turnNumber = 2;

    state.hostBoard = [
      {
        cardId: "monster-1",
        definitionId: "warrior-1",
        position: "defense",
        faceDown: false,
        canAttack: true,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: true, // Changed position last turn
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
    ];

    // Simulate turn start
    state.currentPhase = "end";
    const events = engine.decide({ type: "END_TURN" }, "host");
    engine.evolve(events);

    const newState = engine.getState();

    // Flag should be reset for the new turn player (away)
    // Host's board should remain unchanged
    expect(newState.hostBoard[0].changedPositionThisTurn).toBe(true);

    // Now start host's turn again
    newState.currentPhase = "end";
    const events2 = engine.decide({ type: "END_TURN" }, "away");
    engine.evolve(events2);

    const newState2 = engine.getState();

    // Host's turn starts, flag should be reset
    expect(newState2.hostBoard[0].changedPositionThisTurn).toBe(false);
  });
});
