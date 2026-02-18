import { describe, it, expect } from "vitest";
import { createEngine } from "../engine.js";
import { defineCards } from "../cards.js";
import type { CardDefinition } from "../types/index.js";

const sampleCards: CardDefinition[] = [
  {
    id: "normal-spell",
    name: "Normal Spell",
    type: "spell",
    description: "A normal spell card",
    rarity: "common",
    spellType: "normal",
  },
  {
    id: "continuous-spell",
    name: "Continuous Spell",
    type: "spell",
    description: "A continuous spell card",
    rarity: "common",
    spellType: "continuous",
  },
  {
    id: "field-spell",
    name: "Field Spell",
    type: "spell",
    description: "A field spell card",
    rarity: "rare",
    spellType: "field",
  },
  {
    id: "normal-trap",
    name: "Normal Trap",
    type: "trap",
    description: "A normal trap card",
    rarity: "common",
    trapType: "normal",
    effects: [
      {
        id: "normal-trap-0",
        type: "trigger",
        description: "Deal 100 damage",
        actions: [{ type: "damage", amount: 100, target: "opponent" }],
      },
    ],
  },
  {
    id: "multi-effect-spell",
    name: "Multi Effect Spell",
    type: "spell",
    description: "Spell with multiple selectable effects",
    rarity: "common",
    spellType: "normal",
    effects: [
      {
        id: "multi-effect-spell-0",
        type: "trigger",
        description: "Deal 300 damage",
        actions: [{ type: "damage", amount: 300, target: "opponent" }],
      },
      {
        id: "multi-effect-spell-1",
        type: "trigger",
        description: "Heal 200",
        actions: [{ type: "heal", amount: 200, target: "self" }],
      },
    ],
  },
  {
    id: "continuous-trap",
    name: "Continuous Trap",
    type: "trap",
    description: "A continuous trap card",
    rarity: "common",
    trapType: "continuous",
    effects: [
      {
        id: "continuous-trap-0",
        type: "trigger",
        description: "Deal 100 damage",
        actions: [{ type: "damage", amount: 100, target: "opponent" }],
      },
    ],
  },
  {
    id: "multi-effect-trap",
    name: "Multi Effect Trap",
    type: "trap",
    description: "Trap with multiple selectable effects",
    rarity: "common",
    trapType: "normal",
    effects: [
      {
        id: "multi-effect-trap-0",
        type: "trigger",
        description: "Deal 100 damage",
        actions: [{ type: "damage", amount: 100, target: "opponent" }],
      },
      {
        id: "multi-effect-trap-1",
        type: "trigger",
        description: "Deal 200 damage",
        actions: [{ type: "damage", amount: 200, target: "opponent" }],
      },
    ],
  },
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
];

const cardLookup = defineCards(sampleCards);

function createTestDeck(count: number): string[] {
  return Array(count)
    .fill(null)
    .map((_, i) => {
      const cards = ["warrior-lv4", "normal-spell", "normal-trap"];
      return cards[i % cards.length];
    });
}

describe("spells and traps", () => {
  describe("set spell/trap", () => {
    it("sets a spell face-down in spell/trap zone", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["normal-spell"];

      const events = engine.decide({ type: "SET_SPELL_TRAP", cardId: "normal-spell" }, "host");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("SPELL_TRAP_SET");
      expect(events[0]).toMatchObject({
        type: "SPELL_TRAP_SET",
        seat: "host",
        cardId: "normal-spell",
      });

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Check hand
      expect(newState.hostHand).toEqual([]);

      // Check spell/trap zone
      expect(newState.hostSpellTrapZone).toHaveLength(1);
      expect(newState.hostSpellTrapZone[0].cardId).toBe("normal-spell");
      expect(newState.hostSpellTrapZone[0].faceDown).toBe(true);
      expect(newState.hostSpellTrapZone[0].activated).toBe(false);
    });

    it("sets a trap face-down in spell/trap zone", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["normal-trap"];

      const events = engine.decide({ type: "SET_SPELL_TRAP", cardId: "normal-trap" }, "host");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("SPELL_TRAP_SET");

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      expect(newState.hostSpellTrapZone).toHaveLength(1);
      expect(newState.hostSpellTrapZone[0].cardId).toBe("normal-trap");
      expect(newState.hostSpellTrapZone[0].faceDown).toBe(true);
    });

    it("rejects set if spell/trap zone is full", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["normal-spell"];

      // Fill spell/trap zone (default config.maxSpellTrapSlots is 3)
      state.hostSpellTrapZone = [
        { cardId: "spell-1", definitionId: "normal-spell", faceDown: true, activated: false },
        { cardId: "spell-2", definitionId: "normal-spell", faceDown: true, activated: false },
        { cardId: "spell-3", definitionId: "normal-spell", faceDown: true, activated: false },
      ];

      const events = engine.decide({ type: "SET_SPELL_TRAP", cardId: "normal-spell" }, "host");
      expect(events).toHaveLength(0);
    });
  });

  describe("activate spell", () => {
    it("activates a normal spell from hand and sends it to graveyard", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["normal-spell"];

      const events = engine.decide({ type: "ACTIVATE_SPELL", cardId: "normal-spell", targets: [] }, "host");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("SPELL_ACTIVATED");
      expect(events[0]).toMatchObject({
        type: "SPELL_ACTIVATED",
        seat: "host",
        cardId: "normal-spell",
        targets: [],
      });

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Check hand
      expect(newState.hostHand).toEqual([]);

      // Normal spell should go to graveyard
      expect(newState.hostGraveyard).toContain("normal-spell");

      // Spell/trap zone should be empty
      expect(newState.hostSpellTrapZone).toHaveLength(0);
    });

    it("activates selected effect for multi-effect spell", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["multi-effect-spell"];

      const events = engine.decide({
        type: "ACTIVATE_SPELL",
        cardId: "multi-effect-spell",
        effectIndex: 1,
        targets: [],
      }, "host");
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: "SPELL_ACTIVATED",
        seat: "host",
        cardId: "multi-effect-spell",
      });
      expect(events[1]).toMatchObject({
        type: "DAMAGE_DEALT",
        seat: "host",
        amount: -200,
        isBattle: false,
      });
    });

    it("ignores invalid spell effect index and only emits activation event", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["multi-effect-spell"];

      const events = engine.decide({
        type: "ACTIVATE_SPELL",
        cardId: "multi-effect-spell",
        effectIndex: 9,
        targets: [],
      }, "host");
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "SPELL_ACTIVATED",
        seat: "host",
        cardId: "multi-effect-spell",
      });
      expect(events.some(e => e.type === "DAMAGE_DEALT")).toBe(false);
    });

    it("activates a set spell face-down and sends it to graveyard", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostSpellTrapZone = [
        { cardId: "set-spell", definitionId: "normal-spell", faceDown: true, activated: false },
      ];

      const events = engine.decide({ type: "ACTIVATE_SPELL", cardId: "set-spell", targets: [] }, "host");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("SPELL_ACTIVATED");

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Should go to graveyard
      expect(newState.hostGraveyard).toContain("set-spell");

      // Spell/trap zone should be empty
      expect(newState.hostSpellTrapZone).toHaveLength(0);
    });

    it("activates a continuous spell from hand and keeps it face-up on field", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["continuous-spell"];

      const events = engine.decide({ type: "ACTIVATE_SPELL", cardId: "continuous-spell", targets: [] }, "host");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("SPELL_ACTIVATED");

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Check hand
      expect(newState.hostHand).toEqual([]);

      // Continuous spell should stay on field face-up
      expect(newState.hostSpellTrapZone).toHaveLength(1);
      expect(newState.hostSpellTrapZone[0].cardId).toBe("continuous-spell");
      expect(newState.hostSpellTrapZone[0].faceDown).toBe(false);
      expect(newState.hostSpellTrapZone[0].activated).toBe(true);

      // Should NOT be in graveyard
      expect(newState.hostGraveyard).not.toContain("continuous-spell");
    });

    it("activates a set continuous spell and flips it face-up", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostSpellTrapZone = [
        { cardId: "set-continuous", definitionId: "continuous-spell", faceDown: true, activated: false },
      ];

      const events = engine.decide({ type: "ACTIVATE_SPELL", cardId: "set-continuous", targets: [] }, "host");
      expect(events).toHaveLength(1);

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Should stay on field, face-up
      expect(newState.hostSpellTrapZone).toHaveLength(1);
      expect(newState.hostSpellTrapZone[0].cardId).toBe("set-continuous");
      expect(newState.hostSpellTrapZone[0].faceDown).toBe(false);
      expect(newState.hostSpellTrapZone[0].activated).toBe(true);
    });

    it("activates a field spell and sets it as field spell zone", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["field-spell"];

      const events = engine.decide({ type: "ACTIVATE_SPELL", cardId: "field-spell", targets: [] }, "host");
      expect(events).toHaveLength(1);

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Check hand
      expect(newState.hostHand).toEqual([]);

      // Field spell should be in field spell zone
      expect(newState.hostFieldSpell).not.toBeNull();
      expect(newState.hostFieldSpell?.cardId).toBe("field-spell");
      expect(newState.hostFieldSpell?.faceDown).toBe(false);
      expect(newState.hostFieldSpell?.isFieldSpell).toBe(true);

      // Should NOT be in spell/trap zone or graveyard
      expect(newState.hostSpellTrapZone).toHaveLength(0);
      expect(newState.hostGraveyard).not.toContain("field-spell");
    });

    it("replaces existing field spell when activating a new one", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["field-spell"];
      state.hostFieldSpell = {
        cardId: "old-field",
        definitionId: "field-spell",
        faceDown: false,
        activated: true,
        isFieldSpell: true,
      };

      const events = engine.decide({ type: "ACTIVATE_SPELL", cardId: "field-spell", targets: [] }, "host");
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("CARD_SENT_TO_GRAVEYARD");
      expect(events[0]).toMatchObject({
        type: "CARD_SENT_TO_GRAVEYARD",
        cardId: "old-field",
        from: "field",
      });
      expect(events[1].type).toBe("SPELL_ACTIVATED");

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Old field spell should be in graveyard
      expect(newState.hostGraveyard).toContain("old-field");

      // New field spell should be active
      expect(newState.hostFieldSpell?.cardId).toBe("field-spell");
    });

    it("throws engine invariant when SPELL_ACTIVATED references missing definition", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.hostSpellTrapZone = [
        { cardId: "set-spell", definitionId: "missing-definition", faceDown: true, activated: false },
      ];

      expect(() =>
        engine.evolve([
          { type: "SPELL_ACTIVATED", seat: "host", cardId: "set-spell", targets: [] },
        ])
      ).toThrow("[engine invariant]");
    });
  });

  describe("activate trap", () => {
    it("activates a normal trap and sends it to graveyard", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostSpellTrapZone = [
        { cardId: "set-trap", definitionId: "normal-trap", faceDown: true, activated: false },
      ];

      const events = engine.decide({ type: "ACTIVATE_TRAP", cardId: "set-trap", targets: [] }, "host");
      expect(events.map((event) => event.type)).toEqual([
        "CHAIN_STARTED",
        "CHAIN_LINK_ADDED",
        "TRAP_ACTIVATED",
      ]);
      expect(events[1]).toMatchObject({
        type: "CHAIN_LINK_ADDED",
        cardId: "set-trap",
        seat: "host",
      });
      expect(events[2]).toMatchObject({
        type: "TRAP_ACTIVATED",
        seat: "host",
        cardId: "set-trap",
        targets: [],
      });
      expect(events.some((event) => event.type === "DAMAGE_DEALT")).toBe(false);

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Should go to graveyard
      expect(newState.hostGraveyard).toContain("set-trap");

      // Spell/trap zone should be empty
      expect(newState.hostSpellTrapZone).toHaveLength(0);
      expect(newState.currentChain).toHaveLength(1);
    });

    it("activates a continuous trap and keeps it face-up on field", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostSpellTrapZone = [
        { cardId: "set-continuous-trap", definitionId: "continuous-trap", faceDown: true, activated: false },
      ];

      const events = engine.decide({ type: "ACTIVATE_TRAP", cardId: "set-continuous-trap", targets: [] }, "host");
      expect(events.map((event) => event.type)).toEqual([
        "CHAIN_STARTED",
        "CHAIN_LINK_ADDED",
        "TRAP_ACTIVATED",
      ]);

      // Apply events
      engine.evolve(events);
      const newState = engine.getState();

      // Should stay on field, face-up
      expect(newState.hostSpellTrapZone).toHaveLength(1);
      expect(newState.hostSpellTrapZone[0].cardId).toBe("set-continuous-trap");
      expect(newState.hostSpellTrapZone[0].faceDown).toBe(false);
      expect(newState.hostSpellTrapZone[0].activated).toBe(true);

      // Should NOT be in graveyard
      expect(newState.hostGraveyard).not.toContain("set-continuous-trap");
      expect(newState.currentChain).toHaveLength(1);
    });

    it("activates selected effect for multi-effect trap", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostSpellTrapZone = [
        { cardId: "set-multi-trap", definitionId: "multi-effect-trap", faceDown: true, activated: false },
      ];

      const events = engine.decide({
        type: "ACTIVATE_TRAP",
        cardId: "set-multi-trap",
        effectIndex: 1,
        targets: [],
      }, "host");
      expect(events.map((event) => event.type)).toEqual([
        "CHAIN_STARTED",
        "CHAIN_LINK_ADDED",
        "TRAP_ACTIVATED",
      ]);
      expect(events[1]).toMatchObject({
        type: "CHAIN_LINK_ADDED",
        cardId: "set-multi-trap",
        seat: "host",
        effectIndex: 1,
      });
      expect(events[2]).toMatchObject({
        type: "TRAP_ACTIVATED",
        seat: "host",
        cardId: "set-multi-trap",
      });
      expect(events.some((event) => event.type === "DAMAGE_DEALT")).toBe(false);
    });

    it("ignores invalid trap effect index and only emits activation event", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostSpellTrapZone = [
        { cardId: "set-multi-trap", definitionId: "multi-effect-trap", faceDown: true, activated: false },
      ];

      const events = engine.decide({
        type: "ACTIVATE_TRAP",
        cardId: "set-multi-trap",
        effectIndex: 9,
        targets: [],
      }, "host");
      expect(events).toHaveLength(0);
    });

    it("rejects trap activation if not face-down", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostSpellTrapZone = [
        { cardId: "face-up-trap", definitionId: "normal-trap", faceDown: false, activated: true },
      ];

      const events = engine.decide({ type: "ACTIVATE_TRAP", cardId: "face-up-trap", targets: [] }, "host");
      expect(events).toHaveLength(0);
    });

    it("rejects trap activation if not in spell/trap zone", () => {
      const engine = createEngine({
        cardLookup,
        hostId: "player1",
        awayId: "player2",
        hostDeck: createTestDeck(40),
        awayDeck: createTestDeck(40),
      });

      const state = engine.getState();
      state.currentPhase = "main";
      state.hostHand = ["normal-trap"];

      const events = engine.decide({ type: "ACTIVATE_TRAP", cardId: "normal-trap", targets: [] }, "host");
      expect(events).toHaveLength(0);
    });
  });
});
