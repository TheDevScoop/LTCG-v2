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
    id: "warrior-2",
    name: "Weak Warrior",
    type: "stereotype",
    description: "A weak warrior",
    rarity: "common",
    attack: 500,
    defense: 300,
    level: 2,
    attribute: "earth",
  },
  {
    id: "warrior-high",
    name: "High Level Warrior",
    type: "stereotype",
    description: "A high level warrior",
    rarity: "rare",
    attack: 2500,
    defense: 2000,
    level: 7,
    attribute: "light",
  },
  {
    id: "spell-1",
    name: "Test Spell",
    type: "spell",
    description: "A test spell",
    rarity: "common",
    spellType: "normal",
  },
  {
    id: "trap-1",
    name: "Test Trap",
    type: "trap",
    description: "A test trap",
    rarity: "common",
    trapType: "normal",
  },
];

const cardLookup = defineCards(sampleCards);

function createTestDeck(count: number): string[] {
  return Array(count)
    .fill(null)
    .map((_, i) => (i % 2 === 0 ? "warrior-1" : "spell-1"));
}

describe("createEngine", () => {
  it("creates an engine with initial state", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    expect(state.hostId).toBe("player1");
    expect(state.awayId).toBe("player2");
    expect(state.hostLifePoints).toBe(8000);
    expect(state.awayLifePoints).toBe(8000);
    expect(state.hostHand).toHaveLength(5);
    expect(state.awayHand).toHaveLength(5);
    expect(state.hostDeck).toHaveLength(35);
    expect(state.awayDeck).toHaveLength(35);
    expect(state.currentPhase).toBe("draw");
    expect(state.turnNumber).toBe(1);
    expect(state.currentTurnPlayer).toBe("host");
    expect(state.gameOver).toBe(false);
  });

  it("initial state has gameStarted flag", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });
    const state = engine.getState();
    expect(state.gameStarted).toBe(true);
  });

  it("respects custom first player", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
      firstPlayer: "away",
    });

    const state = engine.getState();
    expect(state.currentTurnPlayer).toBe("away");
  });

  it("respects custom config", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
      config: {
        startingLP: 10000,
        startingHandSize: 6,
      },
    });

    const state = engine.getState();
    expect(state.hostLifePoints).toBe(10000);
    expect(state.awayLifePoints).toBe(10000);
    expect(state.hostHand).toHaveLength(6);
    expect(state.awayHand).toHaveLength(6);
  });
});

describe("mask", () => {
  it("hides opponent hand contents", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const hostView = engine.mask("host");
    expect(hostView.hand).toHaveLength(5);
    expect(hostView.opponentHandCount).toBe(5);
    expect(hostView.hand[0]).toBeTruthy(); // Can see own hand
  });

  it("shows life points for both players", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const hostView = engine.mask("host");
    expect(hostView.lifePoints).toBe(8000);
    expect(hostView.opponentLifePoints).toBe(8000);
  });

  it("shows correct seat information", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const hostView = engine.mask("host");
    expect(hostView.mySeat).toBe("host");
    expect(hostView.currentTurnPlayer).toBe("host");

    const awayView = engine.mask("away");
    expect(awayView.mySeat).toBe("away");
    expect(awayView.currentTurnPlayer).toBe("host");
  });

  it("masks opponent face-down cards", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    // Manually add a face-down card to opponent board for testing
    const state = engine.getState();
    state.awayBoard.push({
      cardId: "card-123",
      definitionId: "warrior-1",
      position: "defense",
      faceDown: true,
      canAttack: false,
      hasAttackedThisTurn: false,
      changedPositionThisTurn: false,
      viceCounters: 0,
      temporaryBoosts: { attack: 0, defense: 0 },
      equippedCards: [],
      turnSummoned: 1,
    });

    const hostView = engine.mask("host");
    expect(hostView.opponentBoard[0].definitionId).toBe("hidden");
    expect(hostView.opponentBoard[0].faceDown).toBe(true);
  });
});

describe("legalMoves", () => {
  it("returns moves for current turn player", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const moves = engine.legalMoves("host");
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some((m) => m.type === "ADVANCE_PHASE")).toBe(true);
    expect(moves.some((m) => m.type === "END_TURN")).toBe(true);
    expect(moves.some((m) => m.type === "SURRENDER")).toBe(true);
  });

  it("returns empty for non-current player", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const moves = engine.legalMoves("away");
    expect(moves).toEqual([]);
  });

  it("returns empty when game is over", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    // Manually set game over
    const state = engine.getState();
    state.gameOver = true;

    const moves = engine.legalMoves("host");
    expect(moves).toEqual([]);
  });

  it("includes SUMMON/SET_MONSTER during main phase for hand monsters", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    // Advance to main phase
    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = ["warrior-1"];

    const moves = engine.legalMoves("host");

    // Should have SUMMON (attack), SUMMON (defense), and SET_MONSTER
    const summonMoves = moves.filter((m) => m.type === "SUMMON");
    const setMonsterMoves = moves.filter((m) => m.type === "SET_MONSTER");

    expect(summonMoves).toHaveLength(2); // attack and defense
    expect(setMonsterMoves).toHaveLength(1);

    expect(summonMoves.some((m) => m.type === "SUMMON" && m.cardId === "warrior-1" && m.position === "attack")).toBe(
      true
    );
    expect(summonMoves.some((m) => m.type === "SUMMON" && m.cardId === "warrior-1" && m.position === "defense")).toBe(
      true
    );
    expect(setMonsterMoves[0]).toEqual({ type: "SET_MONSTER", cardId: "warrior-1" });
  });

  it("excludes SUMMON/SET_MONSTER if already summoned this turn", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = ["warrior-1"];
    state.hostNormalSummonedThisTurn = true;

    const moves = engine.legalMoves("host");

    const summonMoves = moves.filter((m) => m.type === "SUMMON");
    const setMonsterMoves = moves.filter((m) => m.type === "SET_MONSTER");

    expect(summonMoves).toHaveLength(0);
    expect(setMonsterMoves).toHaveLength(0);
  });

  it("excludes SUMMON/SET_MONSTER if board is full", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = ["warrior-1"];

    // Fill the board (maxBoardSlots = 3)
    state.hostBoard = [
      {
        cardId: "b1",
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
      {
        cardId: "b2",
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
      {
        cardId: "b3",
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

    const moves = engine.legalMoves("host");

    const summonMoves = moves.filter((m) => m.type === "SUMMON");
    const setMonsterMoves = moves.filter((m) => m.type === "SET_MONSTER");

    expect(summonMoves).toHaveLength(0);
    expect(setMonsterMoves).toHaveLength(0);
  });

  it("includes tribute summon for level 7+ monsters", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = ["warrior-high"];
    state.hostBoard = [
      {
        cardId: "tribute1",
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

    const moves = engine.legalMoves("host");
    const summonMoves = moves.filter((m) => m.type === "SUMMON" && m.cardId === "warrior-high");

    // Should have 2 summon moves (attack/defense) with tribute
    expect(summonMoves).toHaveLength(2);
    expect(summonMoves[0].tributeCardIds).toEqual(["tribute1"]);
    expect(summonMoves[1].tributeCardIds).toEqual(["tribute1"]);
  });

  it("includes FLIP_SUMMON for face-down monsters set on previous turn", () => {
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
        cardId: "facedown1",
        definitionId: "warrior-1",
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

    const moves = engine.legalMoves("host");
    const flipMoves = moves.filter((m) => m.type === "FLIP_SUMMON");

    expect(flipMoves).toHaveLength(1);
    expect(flipMoves[0]).toEqual({ type: "FLIP_SUMMON", cardId: "facedown1" });
  });

  it("excludes FLIP_SUMMON for monsters set this turn", () => {
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
        cardId: "facedown1",
        definitionId: "warrior-1",
        position: "defense",
        faceDown: true,
        canAttack: false,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 2, // Set this turn
      },
    ];

    const moves = engine.legalMoves("host");
    const flipMoves = moves.filter((m) => m.type === "FLIP_SUMMON");

    expect(flipMoves).toHaveLength(0);
  });

  it("includes SET_SPELL_TRAP during main phase", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = ["spell-1", "trap-1"];

    const moves = engine.legalMoves("host");
    const setSpellTrapMoves = moves.filter((m) => m.type === "SET_SPELL_TRAP");

    expect(setSpellTrapMoves).toHaveLength(2);
    expect(setSpellTrapMoves.some((m) => m.cardId === "spell-1")).toBe(true);
    expect(setSpellTrapMoves.some((m) => m.cardId === "trap-1")).toBe(true);
  });

  it("excludes SET_SPELL_TRAP if spell/trap zone is full", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = ["spell-1"];

    // Fill spell/trap zone (maxSpellTrapSlots = 3)
    state.hostSpellTrapZone = [
      { cardId: "st1", definitionId: "spell-1", faceDown: true, activated: false },
      { cardId: "st2", definitionId: "spell-1", faceDown: true, activated: false },
      { cardId: "st3", definitionId: "spell-1", faceDown: true, activated: false },
    ];

    const moves = engine.legalMoves("host");
    const setSpellTrapMoves = moves.filter((m) => m.type === "SET_SPELL_TRAP");

    expect(setSpellTrapMoves).toHaveLength(0);
  });

  it("includes ACTIVATE_SPELL for spells in hand", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = ["spell-1"];

    const moves = engine.legalMoves("host");
    const activateSpellMoves = moves.filter((m) => m.type === "ACTIVATE_SPELL");

    expect(activateSpellMoves).toHaveLength(1);
    expect(activateSpellMoves[0]).toEqual({ type: "ACTIVATE_SPELL", cardId: "spell-1" });
  });

  it("includes ACTIVATE_SPELL for face-down set spells", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = []; // Clear hand to isolate set spell activation
    state.hostSpellTrapZone = [{ cardId: "setspell1", definitionId: "spell-1", faceDown: true, activated: false }];

    const moves = engine.legalMoves("host");
    const activateSpellMoves = moves.filter((m) => m.type === "ACTIVATE_SPELL");

    expect(activateSpellMoves).toHaveLength(1);
    expect(activateSpellMoves[0]).toEqual({ type: "ACTIVATE_SPELL", cardId: "setspell1" });
  });

  it("includes ACTIVATE_TRAP for face-down set traps", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostSpellTrapZone = [{ cardId: "settrap1", definitionId: "trap-1", faceDown: true, activated: false }];

    const moves = engine.legalMoves("host");
    const activateTrapMoves = moves.filter((m) => m.type === "ACTIVATE_TRAP");

    expect(activateTrapMoves).toHaveLength(1);
    expect(activateTrapMoves[0]).toEqual({ type: "ACTIVATE_TRAP", cardId: "settrap1" });
  });

  it("includes DECLARE_ATTACK during combat phase", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "combat";
    state.turnNumber = 2; // Can't attack on turn 1
    state.hostBoard = [
      {
        cardId: "attacker1",
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
    state.awayBoard = [
      {
        cardId: "defender1",
        definitionId: "warrior-2",
        position: "defense",
        faceDown: false,
        canAttack: false,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
    ];

    const moves = engine.legalMoves("host");
    const attackMoves = moves.filter((m) => m.type === "DECLARE_ATTACK");

    expect(attackMoves).toHaveLength(1);
    expect(attackMoves[0]).toEqual({ type: "DECLARE_ATTACK", attackerId: "attacker1", targetId: "defender1" });
  });

  it("includes direct attack when opponent has no face-up monsters", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "combat";
    state.turnNumber = 2;
    state.hostBoard = [
      {
        cardId: "attacker1",
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
    state.awayBoard = [];

    const moves = engine.legalMoves("host");
    const attackMoves = moves.filter((m) => m.type === "DECLARE_ATTACK");

    expect(attackMoves).toHaveLength(1);
    expect(attackMoves[0]).toEqual({ type: "DECLARE_ATTACK", attackerId: "attacker1" });
  });

  it("excludes attack on turn 1", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "combat";
    state.turnNumber = 1; // Turn 1
    state.hostBoard = [
      {
        cardId: "attacker1",
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

    const moves = engine.legalMoves("host");
    const attackMoves = moves.filter((m) => m.type === "DECLARE_ATTACK");

    expect(attackMoves).toHaveLength(0);
  });

  it("excludes attack for monsters that already attacked", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "combat";
    state.turnNumber = 2;
    state.hostBoard = [
      {
        cardId: "attacker1",
        definitionId: "warrior-1",
        position: "attack",
        faceDown: false,
        canAttack: true,
        hasAttackedThisTurn: true, // Already attacked
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
    ];

    const moves = engine.legalMoves("host");
    const attackMoves = moves.filter((m) => m.type === "DECLARE_ATTACK");

    expect(attackMoves).toHaveLength(0);
  });

  it("excludes attack for face-down monsters", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "combat";
    state.turnNumber = 2;
    state.hostBoard = [
      {
        cardId: "attacker1",
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

    const moves = engine.legalMoves("host");
    const attackMoves = moves.filter((m) => m.type === "DECLARE_ATTACK");

    expect(attackMoves).toHaveLength(0);
  });

  it("allows attacks against both face-up and face-down opponent monsters", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "combat";
    state.turnNumber = 2;
    state.hostBoard = [
      {
        cardId: "attacker1",
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
    state.awayBoard = [
      {
        cardId: "defender1",
        definitionId: "warrior-2",
        position: "defense",
        faceDown: false,
        canAttack: false,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
      {
        cardId: "defender2",
        definitionId: "warrior-1",
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

    const moves = engine.legalMoves("host");
    const attackMoves = moves.filter((m) => m.type === "DECLARE_ATTACK");

    // Should be able to attack both monsters (2 total)
    expect(attackMoves).toHaveLength(2);
    expect(attackMoves.some((m) => m.attackerId === "attacker1" && m.targetId === "defender1")).toBe(true);
    expect(attackMoves.some((m) => m.attackerId === "attacker1" && m.targetId === "defender2")).toBe(true);
  });

  it("does not allow direct attack when opponent has face-up monsters", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "combat";
    state.turnNumber = 2;
    state.hostBoard = [
      {
        cardId: "attacker1",
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
    state.awayBoard = [
      {
        cardId: "defender1",
        definitionId: "warrior-2",
        position: "attack",
        faceDown: false, // Face-up monster
        canAttack: false,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: 1,
      },
    ];

    const moves = engine.legalMoves("host");
    const attackMoves = moves.filter((m) => m.type === "DECLARE_ATTACK");

    // Should only be able to attack the monster, not direct attack
    expect(attackMoves).toHaveLength(1);
    expect(attackMoves[0]).toEqual({ type: "DECLARE_ATTACK", attackerId: "attacker1", targetId: "defender1" });
  });

  it("allows direct attack when opponent only has face-down monsters", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "combat";
    state.turnNumber = 2;
    state.hostBoard = [
      {
        cardId: "attacker1",
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
    state.awayBoard = [
      {
        cardId: "defender1",
        definitionId: "warrior-2",
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

    const moves = engine.legalMoves("host");
    const attackMoves = moves.filter((m) => m.type === "DECLARE_ATTACK");

    // Should be able to attack the face-down monster AND direct attack (2 total)
    expect(attackMoves).toHaveLength(2);
    expect(attackMoves.some((m) => m.attackerId === "attacker1" && m.targetId === "defender1")).toBe(true);
    expect(attackMoves.some((m) => m.attackerId === "attacker1" && m.targetId === undefined)).toBe(true);
  });

  it("excludes summons/sets for non-monster cards in hand", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "main";
    state.hostHand = ["spell-1", "trap-1"]; // Only spells/traps, no monsters

    const moves = engine.legalMoves("host");
    const summonMoves = moves.filter((m) => m.type === "SUMMON");
    const setMonsterMoves = moves.filter((m) => m.type === "SET_MONSTER");

    expect(summonMoves).toHaveLength(0);
    expect(setMonsterMoves).toHaveLength(0);
  });

  it("no summon/set/spell/trap moves during non-main phases", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.currentPhase = "standby"; // Not main/main2
    state.hostHand = ["warrior-1", "spell-1"];

    const moves = engine.legalMoves("host");
    const summonMoves = moves.filter((m) => m.type === "SUMMON");
    const setMonsterMoves = moves.filter((m) => m.type === "SET_MONSTER");
    const setSpellTrapMoves = moves.filter((m) => m.type === "SET_SPELL_TRAP");
    const activateSpellMoves = moves.filter((m) => m.type === "ACTIVATE_SPELL");

    expect(summonMoves).toHaveLength(0);
    expect(setMonsterMoves).toHaveLength(0);
    expect(setSpellTrapMoves).toHaveLength(0);
    expect(activateSpellMoves).toHaveLength(0);
  });
});

describe("seeded shuffle", () => {
  it("produces deterministic output with the same seed", () => {
    // Create two engines with same seed
    const engine1 = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
      seed: 12345,
    });

    const engine2 = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
      seed: 12345,
    });

    const state1 = engine1.getState();
    const state2 = engine2.getState();

    // Both should have identical hands and decks
    expect(state1.hostHand).toEqual(state2.hostHand);
    expect(state1.awayHand).toEqual(state2.awayHand);
    expect(state1.hostDeck).toEqual(state2.hostDeck);
    expect(state1.awayDeck).toEqual(state2.awayDeck);
  });

  it("produces different output with different seeds", () => {
    // Create two engines with different seeds
    const engine1 = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
      seed: 12345,
    });

    const engine2 = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
      seed: 54321,
    });

    const state1 = engine1.getState();
    const state2 = engine2.getState();

    // Should have different hands (very unlikely to be identical with different seeds)
    expect(state1.hostHand).not.toEqual(state2.hostHand);
  });

  it("works without seed (backward compatibility)", () => {
    // Create engine without seed - should use Math.random()
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();

    // Should still create valid game state
    expect(state.hostHand).toHaveLength(5);
    expect(state.awayHand).toHaveLength(5);
    expect(state.hostDeck).toHaveLength(35);
    expect(state.awayDeck).toHaveLength(35);
  });
});

describe("source-aware zone transfers", () => {
  it("CARD_SENT_TO_GRAVEYARD removes from the specified source seat when card IDs collide", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.hostHand = [];
    state.awayHand = [];
    state.hostBoard = [
      {
        cardId: "warrior-1",
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
    state.awayBoard = [
      {
        cardId: "warrior-1",
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

    engine.evolve([
      {
        type: "CARD_SENT_TO_GRAVEYARD",
        cardId: "warrior-1",
        from: "board",
        sourceSeat: "away",
      },
    ]);

    const next = engine.getState();
    expect(next.hostBoard).toHaveLength(1);
    expect(next.hostGraveyard).toEqual([]);
    expect(next.awayBoard).toHaveLength(0);
    expect(next.awayGraveyard).toEqual(["warrior-1"]);
  });

  it("CARD_BANISHED removes from source seat spell/trap zone when both sides contain same card id", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.hostSpellTrapZone = [
      { cardId: "trap-1", definitionId: "trap-1", faceDown: true, activated: false },
    ];
    state.awaySpellTrapZone = [
      { cardId: "trap-1", definitionId: "trap-1", faceDown: true, activated: false },
    ];

    engine.evolve([
      {
        type: "CARD_BANISHED",
        cardId: "trap-1",
        from: "spell_trap_zone",
        sourceSeat: "away",
      },
    ]);

    const next = engine.getState();
    expect(next.hostSpellTrapZone).toHaveLength(1);
    expect(next.hostBanished).toEqual([]);
    expect(next.awaySpellTrapZone).toHaveLength(0);
    expect(next.awayBanished).toEqual(["trap-1"]);
  });

  it("CARD_RETURNED_TO_HAND removes from source seat board when both sides contain same card id", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    const state = engine.getState();
    state.hostHand = [];
    state.awayHand = [];
    state.hostBoard = [
      {
        cardId: "warrior-1",
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
    state.awayBoard = [
      {
        cardId: "warrior-1",
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

    engine.evolve([
      {
        type: "CARD_RETURNED_TO_HAND",
        cardId: "warrior-1",
        from: "board",
        sourceSeat: "away",
      },
    ]);

    const next = engine.getState();
    expect(next.hostBoard).toHaveLength(1);
    expect(next.hostHand).toEqual([]);
    expect(next.awayBoard).toHaveLength(0);
    expect(next.awayHand).toContain("warrior-1");
  });
});
