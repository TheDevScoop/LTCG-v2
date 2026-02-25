/**
 * quickplay.test.ts
 *
 * Tests for quick-play spell mechanics: activation from hand during own turn,
 * blocking from hand during opponent's turn, set quick-play chain mechanics,
 * and chain window legal moves.
 */

import { describe, it, expect } from "vitest";
import { decideActivateSpell } from "../rules/spellsTraps.js";
import { legalMoves } from "../engine.js";
import type { GameState, BoardCard, SpellTrapCard } from "../types/state.js";
import type { CardDefinition } from "../types/cards.js";
import type { EngineConfig } from "../types/config.js";
import type { Command } from "../types/commands.js";

// ── Helpers ───────────────────────────────────────────────────

const DEFAULT_CONFIG: EngineConfig = {
  startingLP: 8000,
  deckSize: { min: 40, max: 60 },
  maxHandSize: 7,
  maxBoardSlots: 3,
  maxSpellTrapSlots: 3,
  startingHandSize: 5,
  breakdownThreshold: 3,
  maxBreakdownsToWin: 3,
  pongEnabled: false,
  redemptionEnabled: false,
  redemptionLP: 5000,
};

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

function createMinimalState(overrides: Partial<GameState> = {}): GameState {
  return {
    config: DEFAULT_CONFIG,
    cardLookup: {},
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
    negatedLinks: [],
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
    ...overrides,
  };
}

const quickPlayDef: CardDefinition = {
  id: "qp-spell-def",
  name: "Quick Strike",
  type: "spell",
  description: "Quick-play: Deal 500 damage",
  rarity: "common",
  spellType: "quick-play",
  effects: [
    {
      id: "eff-0",
      type: "quick",
      description: "Deal 500 damage",
      actions: [{ type: "damage", amount: 500, target: "opponent" }],
    },
  ],
};

// ── Tests ────────────────────────────────────────────────────

describe("Quick-play spell: decideActivateSpell", () => {
  it("quick-play from hand activates during own main phase", () => {
    const state = createMinimalState({
      cardLookup: {
        "qp-spell-1": quickPlayDef,
      },
      hostHand: ["qp-spell-1"],
      currentTurnPlayer: "host",
      currentPhase: "main",
    });

    const command: Extract<Command, { type: "ACTIVATE_SPELL" }> = {
      type: "ACTIVATE_SPELL",
      cardId: "qp-spell-1",
    };

    const events = decideActivateSpell(state, "host", command);

    expect(events.length).toBeGreaterThan(0);
    const spellActivated = events.find((e) => e.type === "SPELL_ACTIVATED");
    expect(spellActivated).toBeDefined();
    expect(spellActivated).toMatchObject({
      type: "SPELL_ACTIVATED",
      seat: "host",
      cardId: "qp-spell-1",
    });
  });

  it("quick-play from hand activates during own main2 phase", () => {
    const state = createMinimalState({
      cardLookup: {
        "qp-spell-1": quickPlayDef,
      },
      hostHand: ["qp-spell-1"],
      currentTurnPlayer: "host",
      currentPhase: "main2",
    });

    const command: Extract<Command, { type: "ACTIVATE_SPELL" }> = {
      type: "ACTIVATE_SPELL",
      cardId: "qp-spell-1",
    };

    const events = decideActivateSpell(state, "host", command);

    expect(events.length).toBeGreaterThan(0);
    const spellActivated = events.find((e) => e.type === "SPELL_ACTIVATED");
    expect(spellActivated).toBeDefined();
  });

  it("quick-play from hand blocked during combat phase", () => {
    const state = createMinimalState({
      cardLookup: {
        "qp-spell-1": quickPlayDef,
      },
      hostHand: ["qp-spell-1"],
      currentTurnPlayer: "host",
      currentPhase: "combat",
    });

    const command: Extract<Command, { type: "ACTIVATE_SPELL" }> = {
      type: "ACTIVATE_SPELL",
      cardId: "qp-spell-1",
    };

    const events = decideActivateSpell(state, "host", command);

    expect(events).toHaveLength(0);
  });

  it("set quick-play activates like trap (chain mechanics)", () => {
    const setQP = createSpellTrapCard({
      cardId: "set-qp-1",
      definitionId: "qp-spell-def",
      faceDown: true,
      activated: false,
    });

    const state = createMinimalState({
      cardLookup: {
        "qp-spell-def": quickPlayDef,
      },
      hostSpellTrapZone: [setQP],
      currentTurnPlayer: "host",
      currentPhase: "main",
    });

    const command: Extract<Command, { type: "ACTIVATE_SPELL" }> = {
      type: "ACTIVATE_SPELL",
      cardId: "set-qp-1",
    };

    const events = decideActivateSpell(state, "host", command);

    expect(events.length).toBeGreaterThan(0);

    // Set quick-play spells should start a chain like traps
    const chainStarted = events.find((e) => e.type === "CHAIN_STARTED");
    expect(chainStarted).toBeDefined();

    const chainLink = events.find((e) => e.type === "CHAIN_LINK_ADDED");
    expect(chainLink).toBeDefined();

    const spellActivated = events.find((e) => e.type === "SPELL_ACTIVATED");
    expect(spellActivated).toBeDefined();
  });
});

describe("Quick-play spell: legalMoves", () => {
  it("set quick-play appears in opponent turn legal moves", () => {
    const setQP = createSpellTrapCard({
      cardId: "set-qp-1",
      definitionId: "qp-spell-def",
      faceDown: true,
      activated: false,
    });

    const state = createMinimalState({
      cardLookup: {
        "qp-spell-def": quickPlayDef,
      },
      // It's host's turn, away has a set quick-play
      currentTurnPlayer: "host",
      currentPhase: "main",
      awaySpellTrapZone: [setQP],
    });

    // Away player should be able to activate their set quick-play during opponent's turn
    const moves = legalMoves(state, "away");

    const activateMove = moves.find(
      (m) => m.type === "ACTIVATE_SPELL" && m.cardId === "set-qp-1",
    );
    expect(activateMove).toBeDefined();
  });

  it("set quick-play appears in chain window legal moves", () => {
    const setQP = createSpellTrapCard({
      cardId: "set-qp-1",
      definitionId: "qp-spell-def",
      faceDown: true,
      activated: false,
    });

    const state = createMinimalState({
      cardLookup: {
        "qp-spell-def": quickPlayDef,
      },
      currentTurnPlayer: "host",
      currentPhase: "main",
      awaySpellTrapZone: [setQP],
      // Chain is active and away has priority
      currentChain: [
        {
          cardId: "trigger-card",
          effectIndex: 0,
          activatingPlayer: "host",
          targets: [],
        },
      ],
      currentPriorityPlayer: "away",
    });

    const moves = legalMoves(state, "away");

    // Should be able to pass or respond with the set quick-play
    const passMove = moves.find((m) => m.type === "CHAIN_RESPONSE" && m.pass);
    expect(passMove).toBeDefined();

    const respondMove = moves.find(
      (m) =>
        m.type === "CHAIN_RESPONSE" &&
        !m.pass &&
        m.cardId === "set-qp-1",
    );
    expect(respondMove).toBeDefined();
  });

  it("quick-play in hand does NOT appear in opponent turn legal moves", () => {
    const state = createMinimalState({
      cardLookup: {
        "qp-spell-1": quickPlayDef,
      },
      // It's host's turn, away has a quick-play in hand (not set)
      currentTurnPlayer: "host",
      currentPhase: "main",
      awayHand: ["qp-spell-1"],
    });

    // Away should NOT be able to activate hand quick-play during opponent's turn
    const moves = legalMoves(state, "away");

    const activateMove = moves.find(
      (m) => m.type === "ACTIVATE_SPELL" && m.cardId === "qp-spell-1",
    );
    expect(activateMove).toBeUndefined();
  });

  it("quick-play in hand appears during own main phase", () => {
    const state = createMinimalState({
      cardLookup: {
        "qp-spell-1": quickPlayDef,
      },
      currentTurnPlayer: "host",
      currentPhase: "main",
      hostHand: ["qp-spell-1"],
    });

    const moves = legalMoves(state, "host");

    const activateMove = moves.find(
      (m) => m.type === "ACTIVATE_SPELL" && m.cardId === "qp-spell-1",
    );
    expect(activateMove).toBeDefined();
  });

  it("legalMoves does not throw when instance mapping is absent", () => {
    const state = createMinimalState({
      cardLookup: {
        "qp-spell-1": quickPlayDef,
      },
      currentTurnPlayer: "host",
      currentPhase: "main",
      hostHand: ["qp-spell-1"],
    });

    expect(() => legalMoves(state, "host")).not.toThrow();
  });
});
