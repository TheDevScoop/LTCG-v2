import { describe, it, expect } from "vitest";
import { createEngine } from "../engine.js";
import { defineCards } from "../cards.js";
import type { CardDefinition } from "../types/index.js";

const sampleCards: CardDefinition[] = [
  {
    id: "warrior-lv4",
    name: "Level 4 Warrior",
    type: "stereotype",
    description: "A level 4 warrior",
    rarity: "common",
    attack: 1500,
    defense: 1200,
    level: 4,
    attribute: "fire",
  },
  {
    id: "warrior-lv7",
    name: "Level 7 Warrior",
    type: "stereotype",
    description: "A level 7 warrior",
    rarity: "rare",
    attack: 2500,
    defense: 2000,
    level: 7,
    attribute: "fire",
  },
  {
    id: "warrior-lv6",
    name: "Level 6 Warrior",
    type: "stereotype",
    description: "A level 6 warrior",
    rarity: "common",
    attack: 2000,
    defense: 1500,
    level: 6,
    attribute: "earth",
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
    .map((_, i) => {
      const cards = ["warrior-lv4", "warrior-lv6", "warrior-lv7", "spell-1"];
      return cards[i % cards.length];
    });
}

describe("summoning", () => {
  describe("normal summon", () => {
    it("summons a level 4 monster from hand to board", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      // Manually advance to main phase and ensure we have a monster in hand
      state.currentPhase = "main";
      state.hostHand = ["warrior-lv4", "spell-1"];

      const events = engine.decide({ type: "SUMMON", cardId: "warrior-lv4", position: "attack" }, "host");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("MONSTER_SUMMONED");
      expect(events[0]).toMatchObject({
        type: "MONSTER_SUMMONED",
        seat: "host",
        cardId: "warrior-lv4",
        position: "attack",
        tributes: [],
      });

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Check hand
      expect(newState.hostHand).toEqual(["spell-1"]);

      // Check board
      expect(newState.hostBoard).toHaveLength(1);
      expect(newState.hostBoard[0].cardId).toBe("warrior-lv4");
      expect(newState.hostBoard[0].position).toBe("attack");
      expect(newState.hostBoard[0].faceDown).toBe(false);
      expect(newState.hostBoard[0].canAttack).toBe(false);
      expect(newState.hostBoard[0].turnSummoned).toBe(1);

      // Check normal summon flag
      expect(newState.hostNormalSummonedThisTurn).toBe(true);
    });

    it("tribute summons a level 7+ monster", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["warrior-lv7"];

      // Add a monster to the board to tribute
      state.hostBoard = [
        {
          cardId: "tribute-monster",
          definitionId: "warrior-lv4",
          position: "attack",
          faceDown: false,
          canAttack: true,
          hasAttackedThisTurn: false,
          changedPositionThisTurn: false,
          viceCounters: 0,
          temporaryBoosts: { attack: 0, defense: 0 },
          equippedCards: [],
          turnSummoned: 0,
        },
      ];

      const events = engine.decide(
        {
          type: "SUMMON",
          cardId: "warrior-lv7",
          position: "attack",
          tributeCardIds: ["tribute-monster"],
        },
        "host"
      );

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("CARD_SENT_TO_GRAVEYARD");
      expect(events[0]).toMatchObject({
        type: "CARD_SENT_TO_GRAVEYARD",
        cardId: "tribute-monster",
        from: "board",
      });
      expect(events[1].type).toBe("MONSTER_SUMMONED");
      expect(events[1]).toMatchObject({
        type: "MONSTER_SUMMONED",
        seat: "host",
        cardId: "warrior-lv7",
        position: "attack",
        tributes: ["tribute-monster"],
      });

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Check board - tribute should be gone
      expect(newState.hostBoard).toHaveLength(1);
      expect(newState.hostBoard[0].cardId).toBe("warrior-lv7");

      // Check graveyard
      expect(newState.hostGraveyard).toContain("tribute-monster");

      // Check hand
      expect(newState.hostHand).toEqual([]);
    });

    it("rejects summon if already summoned this turn", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["warrior-lv4"];
      state.hostNormalSummonedThisTurn = true; // Already summoned

      const events = engine.decide({ type: "SUMMON", cardId: "warrior-lv4", position: "attack" }, "host");
      expect(events).toHaveLength(0);
    });

    it("rejects summon if board is full", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["warrior-lv4"];

      // Fill the board (default config.maxBoardSlots is 3)
      state.hostBoard = [
        {
          cardId: "monster-1",
          definitionId: "warrior-lv4",
          position: "attack",
          faceDown: false,
          canAttack: true,
          hasAttackedThisTurn: false,
          changedPositionThisTurn: false,
          viceCounters: 0,
          temporaryBoosts: { attack: 0, defense: 0 },
          equippedCards: [],
          turnSummoned: 0,
        },
        {
          cardId: "monster-2",
          definitionId: "warrior-lv4",
          position: "attack",
          faceDown: false,
          canAttack: true,
          hasAttackedThisTurn: false,
          changedPositionThisTurn: false,
          viceCounters: 0,
          temporaryBoosts: { attack: 0, defense: 0 },
          equippedCards: [],
          turnSummoned: 0,
        },
        {
          cardId: "monster-3",
          definitionId: "warrior-lv4",
          position: "attack",
          faceDown: false,
          canAttack: true,
          hasAttackedThisTurn: false,
          changedPositionThisTurn: false,
          viceCounters: 0,
          temporaryBoosts: { attack: 0, defense: 0 },
          equippedCards: [],
          turnSummoned: 0,
        },
      ];

      const events = engine.decide({ type: "SUMMON", cardId: "warrior-lv4", position: "attack" }, "host");
      expect(events).toHaveLength(0);
    });

    it("allows tribute summon at full board when tribute frees a slot", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["warrior-lv7"];
      state.hostBoard = [
        {
          cardId: "monster-1",
          definitionId: "warrior-lv4",
          position: "attack",
          faceDown: false,
          canAttack: true,
          hasAttackedThisTurn: false,
          changedPositionThisTurn: false,
          viceCounters: 0,
          temporaryBoosts: { attack: 0, defense: 0 },
          equippedCards: [],
          turnSummoned: 0,
        },
        {
          cardId: "monster-2",
          definitionId: "warrior-lv4",
          position: "attack",
          faceDown: false,
          canAttack: true,
          hasAttackedThisTurn: false,
          changedPositionThisTurn: false,
          viceCounters: 0,
          temporaryBoosts: { attack: 0, defense: 0 },
          equippedCards: [],
          turnSummoned: 0,
        },
        {
          cardId: "monster-3",
          definitionId: "warrior-lv4",
          position: "attack",
          faceDown: false,
          canAttack: true,
          hasAttackedThisTurn: false,
          changedPositionThisTurn: false,
          viceCounters: 0,
          temporaryBoosts: { attack: 0, defense: 0 },
          equippedCards: [],
          turnSummoned: 0,
        },
      ];

      const events = engine.decide(
        {
          type: "SUMMON",
          cardId: "warrior-lv7",
          position: "attack",
          tributeCardIds: ["monster-1"],
        },
        "host",
      );
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: "CARD_SENT_TO_GRAVEYARD",
        cardId: "monster-1",
        from: "board",
      });
      expect(events[1]).toMatchObject({
        type: "MONSTER_SUMMONED",
        cardId: "warrior-lv7",
      });
    });
  });

  describe("set monster", () => {
    it("sets a monster face-down in defense position", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["warrior-lv4"];

      const events = engine.decide({ type: "SET_MONSTER", cardId: "warrior-lv4" }, "host");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("MONSTER_SET");
      expect(events[0]).toMatchObject({
        type: "MONSTER_SET",
        seat: "host",
        cardId: "warrior-lv4",
      });

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Check hand
      expect(newState.hostHand).toEqual([]);

      // Check board
      expect(newState.hostBoard).toHaveLength(1);
      expect(newState.hostBoard[0].cardId).toBe("warrior-lv4");
      expect(newState.hostBoard[0].position).toBe("defense");
      expect(newState.hostBoard[0].faceDown).toBe(true);

      // Check normal summon flag
      expect(newState.hostNormalSummonedThisTurn).toBe(true);
    });
  });

  describe("flip summon", () => {
    it("flips a face-down monster to face-up attack position", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.turnNumber = 2; // Make it turn 2

      // Add a face-down monster that was set on turn 1
      state.hostBoard = [
        {
          cardId: "set-monster",
          definitionId: "warrior-lv4",
          position: "defense",
          faceDown: true,
          canAttack: false,
          hasAttackedThisTurn: false,
          changedPositionThisTurn: false,
          viceCounters: 0,
          temporaryBoosts: { attack: 0, defense: 0 },
          equippedCards: [],
          turnSummoned: 1,
        },
      ];

      const events = engine.decide({ type: "FLIP_SUMMON", cardId: "set-monster" }, "host");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("FLIP_SUMMONED");
      expect(events[0]).toMatchObject({
        type: "FLIP_SUMMONED",
        seat: "host",
        cardId: "set-monster",
        position: "attack",
      });

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Check board
      expect(newState.hostBoard).toHaveLength(1);
      expect(newState.hostBoard[0].faceDown).toBe(false);
      expect(newState.hostBoard[0].position).toBe("attack");
      expect(newState.hostBoard[0].changedPositionThisTurn).toBe(true);

      // Check that normal summon flag is NOT set (flip summon doesn't count)
      expect(newState.hostNormalSummonedThisTurn).toBe(false);
    });

    it("cannot flip summon a monster set this turn", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.turnNumber = 1;

      // Add a face-down monster that was set this turn
      state.hostBoard = [
        {
          cardId: "set-monster",
          definitionId: "warrior-lv4",
          position: "defense",
          faceDown: true,
          canAttack: false,
          hasAttackedThisTurn: false,
          changedPositionThisTurn: false,
          viceCounters: 0,
          temporaryBoosts: { attack: 0, defense: 0 },
          equippedCards: [],
          turnSummoned: 1, // Set this turn
        },
      ];

      const events = engine.decide({ type: "FLIP_SUMMON", cardId: "set-monster" }, "host");
      expect(events).toHaveLength(0);
    });
  });
});
