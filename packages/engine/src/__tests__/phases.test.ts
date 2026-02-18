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
];

const cardLookup = defineCards(sampleCards);

function createTestDeck(count: number): string[] {
  return Array(count).fill("warrior-1");
}

describe("ADVANCE_PHASE", () => {
  it("advances phase from draw to standby", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    expect(engine.getState().currentPhase).toBe("draw");

    const events = engine.decide({ type: "ADVANCE_PHASE" }, "host");
    expect(events).toHaveLength(2); // PHASE_CHANGED and CARD_DRAWN
    expect(events[0].type).toBe("PHASE_CHANGED");
    expect(events[0]).toMatchObject({ from: "draw", to: "standby" });
    expect(events[1].type).toBe("CARD_DRAWN");
    expect(events[1]).toMatchObject({ seat: "host" });

    engine.evolve(events);
    expect(engine.getState().currentPhase).toBe("standby");
  });

  it("advances through all phases in order", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const expectedPhases = ["draw", "standby", "main", "combat", "main2", "breakdown_check", "end"];

    for (let i = 0; i < expectedPhases.length; i++) {
      expect(engine.getState().currentPhase).toBe(expectedPhases[i]);
      const events = engine.decide({ type: "ADVANCE_PHASE" }, "host");
      engine.evolve(events);
    }

    // After "end", should wrap back to "draw"
    expect(engine.getState().currentPhase).toBe("draw");
  });

  it("maps ADVANCE_PHASE from end phase to end turn", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    engine.getState().currentPhase = "end";

    const events = engine.decide({ type: "ADVANCE_PHASE" }, "host");
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("TURN_ENDED");
    expect(events[1].type).toBe("TURN_STARTED");
    expect(events[1]).toMatchObject({ seat: "away", turnNumber: 2 });

    engine.evolve(events);
    expect(engine.getState().currentTurnPlayer).toBe("away");
    expect(engine.getState().currentPhase).toBe("draw");
  });
});

describe("END_TURN", () => {
  it("acts like ADVANCE_PHASE when not in end phase", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const events = engine.decide({ type: "END_TURN" }, "host");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "PHASE_CHANGED", from: "draw", to: "standby" });
    expect(events[1]).toMatchObject({ type: "CARD_DRAWN", seat: "host" });

    engine.evolve(events);
    expect(engine.getState().currentTurnPlayer).toBe("host");
    expect(engine.getState().turnNumber).toBe(1);
    expect(engine.getState().currentPhase).toBe("standby");
  });

  it("advances to opponent with correct turn number from end phase", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    engine.getState().currentPhase = "end";

    const events = engine.decide({ type: "END_TURN" }, "host");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "TURN_ENDED", seat: "host" });
    expect(events[1]).toMatchObject({ type: "TURN_STARTED", seat: "away", turnNumber: 2 });

    engine.evolve(events);
    expect(engine.getState().currentTurnPlayer).toBe("away");
    expect(engine.getState().turnNumber).toBe(2);
    expect(engine.getState().currentPhase).toBe("draw");
  });

  it("resets per-turn flags on turn start", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    // Manually set flags
    const state = engine.getState();
    state.hostNormalSummonedThisTurn = true;
    state.optUsedThisTurn = ["effect-1", "effect-2"];
    state.currentPhase = "end";

    const events = engine.decide({ type: "END_TURN" }, "host");
    engine.evolve(events);

    const newState = engine.getState();
    expect(newState.hostNormalSummonedThisTurn).toBe(false);
    expect(newState.awayNormalSummonedThisTurn).toBe(false);
    expect(newState.optUsedThisTurn).toEqual([]);
  });
});

describe("SURRENDER", () => {
  it("ends game with correct winner", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    expect(engine.getState().gameOver).toBe(false);

    const events = engine.decide({ type: "SURRENDER" }, "host");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("GAME_ENDED");
    expect(events[0]).toMatchObject({ winner: "away", reason: "surrender" });

    engine.evolve(events);
    const state = engine.getState();
    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe("away");
    expect(state.winReason).toBe("surrender");
  });

  it("opponent wins when away player surrenders", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
      firstPlayer: "away",
    });

    const events = engine.decide({ type: "SURRENDER" }, "away");
    expect(events[0]).toMatchObject({ winner: "host", reason: "surrender" });

    engine.evolve(events);
    expect(engine.getState().winner).toBe("host");
  });
});
