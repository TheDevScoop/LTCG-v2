import { describe, it, expect } from "vitest";
import { createInitialState } from "../engine.js";
import { checkStateBasedActions, drawCard } from "../rules/stateBasedActions.js";
import { defineCards } from "../cards.js";
import { DEFAULT_CONFIG } from "../types/config.js";
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

describe("checkStateBasedActions", () => {
  it("LP zero triggers game end", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    // Set host LP to 0
    state.hostLifePoints = 0;

    const events = checkStateBasedActions(state);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "GAME_ENDED",
      winner: "away",
      reason: "lp_zero",
    });
  });

  it("LP zero for away player triggers game end", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    // Set away LP to 0
    state.awayLifePoints = 0;

    const events = checkStateBasedActions(state);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "GAME_ENDED",
      winner: "host",
      reason: "lp_zero",
    });
  });

  it("Deck-out triggers game end during draw phase", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    // Empty host deck and set to draw phase
    state.hostDeck = [];
    state.currentPhase = "draw";

    const events = checkStateBasedActions(state);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "DECK_OUT",
      seat: "host",
    });
  });

  it("Deck-out does not trigger outside draw phase", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    // Empty host deck but set to main phase
    state.hostDeck = [];
    state.currentPhase = "main";

    const events = checkStateBasedActions(state);
    expect(events).toHaveLength(0);
  });

  it("Breakdown win triggers game end", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    // Set breakdowns to threshold
    state.hostBreakdownsCaused = 3;

    const events = checkStateBasedActions(state);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "GAME_ENDED",
      winner: "host",
      reason: "breakdown",
    });
  });

  it("Breakdown win for away player triggers game end", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    // Set breakdowns to threshold
    state.awayBreakdownsCaused = 3;

    const events = checkStateBasedActions(state);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "GAME_ENDED",
      winner: "away",
      reason: "breakdown",
    });
  });

  it("Hand size limit enforced at end phase", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    // Add extra cards to host hand (max is 7)
    state.hostHand = [
      "card1",
      "card2",
      "card3",
      "card4",
      "card5",
      "card6",
      "card7",
      "card8",
      "card9",
    ];
    state.currentPhase = "end";

    const events = checkStateBasedActions(state);
    expect(events).toHaveLength(2); // Discard 2 cards
    expect(events[0]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "card8",
      from: "hand",
      sourceSeat: "host",
    });
    expect(events[1]).toEqual({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: "card9",
      from: "hand",
      sourceSeat: "host",
    });
  });

  it("Hand size limit not enforced outside end phase", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    // Add extra cards to host hand
    state.hostHand = [
      "card1",
      "card2",
      "card3",
      "card4",
      "card5",
      "card6",
      "card7",
      "card8",
      "card9",
    ];
    state.currentPhase = "main";

    const events = checkStateBasedActions(state);
    expect(events).toHaveLength(0);
  });

  it("No state-based actions if all conditions are normal", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    const events = checkStateBasedActions(state);
    expect(events).toHaveLength(0);
  });
});

describe("drawCard", () => {
  it("Draw card from deck moves card to hand", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    const topCard = state.hostDeck[0];
    const events = drawCard(state, "host");

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "CARD_DRAWN",
      seat: "host",
      cardId: topCard,
    });
  });

  it("Draw from empty deck triggers deck-out", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    // Empty the deck
    state.hostDeck = [];

    const events = drawCard(state, "host");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "DECK_OUT",
      seat: "host",
    });
  });

  it("Draw card for away player", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    const topCard = state.awayDeck[0];
    const events = drawCard(state, "away");

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "CARD_DRAWN",
      seat: "away",
      cardId: topCard,
    });
  });
});

describe("Phase advancement and draw", () => {
  it("Advancing from draw phase draws a card", () => {
    const state = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      "player1",
      "player2",
      createTestDeck(40),
      createTestDeck(40),
      "host"
    );

    // State is already in draw phase
    expect(state.currentPhase).toBe("draw");

    const topCard = state.hostDeck[0];
    const drawEvents = drawCard(state, state.currentTurnPlayer);

    expect(drawEvents).toHaveLength(1);
    expect(drawEvents[0].type).toBe("CARD_DRAWN");
    expect(drawEvents[0]).toEqual({
      type: "CARD_DRAWN",
      seat: "host",
      cardId: topCard,
    });
  });
});
