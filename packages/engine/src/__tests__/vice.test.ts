import { describe, it, expect } from "vitest";
import { createEngine, createInitialState } from "../engine.js";
import type { GameState, BoardCard } from "../types/state.js";
import type { CardDefinition } from "../types/cards.js";
import { DEFAULT_CONFIG } from "../types/config.js";
import { addViceCounters, removeViceCounters, checkBreakdowns } from "../rules/vice.js";

describe("Vice System", () => {
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
  };

  function createViceState(): GameState {
    return createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "host-player",
      "away-player",
      ["monster1"],
      ["monster2"],
      "host"
    );
  }

  function addMonsterToBoard(
    state: GameState,
    seat: "host" | "away",
    cardId: string,
    viceCounters: number = 0
  ): GameState {
    const newState = { ...state };
    const board = seat === "host" ? [...newState.hostBoard] : [...newState.awayBoard];

    const newCard: BoardCard = {
      cardId,
      definitionId: cardId,
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

    board.push(newCard);

    if (seat === "host") {
      newState.hostBoard = board;
    } else {
      newState.awayBoard = board;
    }

    return newState;
  }

  it("addViceCounters increases counter on board card", () => {
    let state = createViceState();
    state = addMonsterToBoard(state, "host", "monster1", 1);

    const events = addViceCounters(state, "monster1", 1);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "VICE_COUNTER_ADDED",
      cardId: "monster1",
      newCount: 2,
    });

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);
    engine.evolve(events);

    const newState = engine.getState();
    expect(newState.hostBoard[0].viceCounters).toBe(2);
  });

  it("checkBreakdowns triggers when counter >= threshold", () => {
    let state = createViceState();
    state = addMonsterToBoard(state, "host", "monster1", 3); // At threshold

    const events = checkBreakdowns(state);

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      type: "BREAKDOWN_TRIGGERED",
      seat: "host",
      cardId: "monster1",
    });
    expect(events[1]).toEqual({
      type: "CARD_DESTROYED",
      cardId: "monster1",
      reason: "breakdown",
    });
    expect(events[2]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "monster1",
      from: "board",
      sourceSeat: "host",
    });
  });

  it("Breakdown increments opponent's breakdownsCaused", () => {
    let state = createViceState();
    state = addMonsterToBoard(state, "host", "monster1", 3);

    const events = checkBreakdowns(state);

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);
    engine.evolve(events);

    const newState = engine.getState();
    expect(newState.awayBreakdownsCaused).toBe(1);
    expect(newState.hostBreakdownsCaused).toBe(0);
    expect(newState.hostBoard).toHaveLength(0);
    expect(newState.hostGraveyard).toContain("monster1");
  });

  it("Three breakdowns wins the game", () => {
    let state = createViceState();
    state.awayBreakdownsCaused = 2; // Already has 2
    state = addMonsterToBoard(state, "host", "monster1", 3);

    const events = checkBreakdowns(state);

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);
    engine.evolve(events);

    const newState = engine.getState();
    expect(newState.awayBreakdownsCaused).toBe(3);
    expect(newState.gameOver).toBe(true);
    expect(newState.winner).toBe("away");
    expect(newState.winReason).toBe("breakdown");
  });

  it("removeViceCounters decreases counter", () => {
    let state = createViceState();
    state = addMonsterToBoard(state, "host", "monster1", 2);

    const events = removeViceCounters(state, "monster1", 1);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "VICE_COUNTER_REMOVED",
      cardId: "monster1",
      newCount: 1,
    });

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);
    engine.evolve(events);

    const newState = engine.getState();
    expect(newState.hostBoard[0].viceCounters).toBe(1);
  });

  it("Vice counter doesn't go below 0", () => {
    let state = createViceState();
    state = addMonsterToBoard(state, "host", "monster1", 1);

    const events = removeViceCounters(state, "monster1", 5);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "VICE_COUNTER_REMOVED",
      cardId: "monster1",
      newCount: 0,
    });

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);
    engine.evolve(events);

    const newState = engine.getState();
    expect(newState.hostBoard[0].viceCounters).toBe(0);
  });

  it("checkBreakdowns does nothing when below threshold", () => {
    let state = createViceState();
    state = addMonsterToBoard(state, "host", "monster1", 2); // Below threshold (3)

    const events = checkBreakdowns(state);

    expect(events).toHaveLength(0);
  });

  it("Multiple breakdowns in same check", () => {
    let state = createViceState();
    state = addMonsterToBoard(state, "host", "monster1", 3);
    state = addMonsterToBoard(state, "host", "monster2", 4);

    const events = checkBreakdowns(state);

    expect(events).toHaveLength(6); // 3 events per breakdown
    expect(events[0].type).toBe("BREAKDOWN_TRIGGERED");
    expect(events[3].type).toBe("BREAKDOWN_TRIGGERED");
  });

  it("Vice counters work on away board", () => {
    let state = createViceState();
    state = addMonsterToBoard(state, "away", "monster2", 1);

    const events = addViceCounters(state, "monster2", 2);

    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: [],
      awayDeck: [],
      firstPlayer: "host",
    });

    Object.assign(engine.getState(), state);
    engine.evolve(events);

    const newState = engine.getState();
    expect(newState.awayBoard[0].viceCounters).toBe(3);

    // Check breakdown
    const breakdownEvents = checkBreakdowns(newState);
    expect(breakdownEvents).toHaveLength(3);
    expect(breakdownEvents[0]).toEqual({
      type: "BREAKDOWN_TRIGGERED",
      seat: "away",
      cardId: "monster2",
    });
  });
});
