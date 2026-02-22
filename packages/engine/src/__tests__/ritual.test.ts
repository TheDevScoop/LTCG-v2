/**
 * ritual.test.ts
 *
 * Tests for ritual spell mechanics: valid tributes, level validation,
 * hand requirement, and face-up tribute requirement.
 */

import { describe, it, expect } from "vitest";
import { decideActivateSpell } from "../rules/spellsTraps.js";
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

const ritualSpellDef: CardDefinition = {
  id: "ritual-spell-def",
  name: "Ritual of Power",
  type: "spell",
  description: "Ritual summon a monster",
  rarity: "common",
  spellType: "ritual",
  effects: [],
};

const ritualMonsterDef: CardDefinition = {
  id: "ritual-monster-def",
  name: "Ritual Beast",
  type: "stereotype",
  description: "A powerful ritual monster",
  rarity: "rare",
  attribute: "dark",
  level: 7,
  attack: 2500,
  defense: 2000,
};

const tributeMonsterDef: CardDefinition = {
  id: "tribute-def",
  name: "Tribute Fodder",
  type: "stereotype",
  description: "",
  rarity: "common",
  attribute: "fire",
  level: 4,
  attack: 1200,
  defense: 1000,
};

const smallTributeDef: CardDefinition = {
  id: "small-tribute-def",
  name: "Small Fodder",
  type: "stereotype",
  description: "",
  rarity: "common",
  attribute: "fire",
  level: 2,
  attack: 800,
  defense: 600,
};

// ── Tests ────────────────────────────────────────────────────

describe("Ritual spell: decideActivateSpell", () => {
  it("ritual summon with valid tributes succeeds", () => {
    const tribute1 = createBoardCard({
      cardId: "tribute-1",
      definitionId: "tribute-def",
    });
    const tribute2 = createBoardCard({
      cardId: "tribute-2",
      definitionId: "tribute-def",
    });

    const state = createMinimalState({
      cardLookup: {
        "ritual-spell-1": ritualSpellDef,
        "ritual-monster-1": ritualMonsterDef,
        "tribute-def": tributeMonsterDef,
      },
      hostHand: ["ritual-spell-1", "ritual-monster-1"],
      hostBoard: [tribute1, tribute2],
    });

    // targets[0] = ritual monster from hand, targets[1..] = tributes from board
    const command: Extract<Command, { type: "ACTIVATE_SPELL" }> = {
      type: "ACTIVATE_SPELL",
      cardId: "ritual-spell-1",
      targets: ["ritual-monster-1", "tribute-1", "tribute-2"],
    };

    const events = decideActivateSpell(state, "host", command);

    // Should have: SPELL_ACTIVATED, CARD_DESTROYED x2, CARD_SENT_TO_GRAVEYARD x2, RITUAL_SUMMONED
    expect(events.length).toBeGreaterThanOrEqual(4);

    const spellActivated = events.find((e) => e.type === "SPELL_ACTIVATED");
    expect(spellActivated).toBeDefined();

    const ritualSummoned = events.find((e) => e.type === "RITUAL_SUMMONED");
    expect(ritualSummoned).toBeDefined();
    expect(ritualSummoned).toMatchObject({
      type: "RITUAL_SUMMONED",
      seat: "host",
      cardId: "ritual-monster-1",
      ritualSpellId: "ritual-spell-1",
      tributes: ["tribute-1", "tribute-2"],
    });
  });

  it("ritual summon fails if tribute levels insufficient", () => {
    // Ritual monster is level 7, but we only have one level 2 tribute
    const smallTribute = createBoardCard({
      cardId: "small-trib-1",
      definitionId: "small-tribute-def",
    });

    const state = createMinimalState({
      cardLookup: {
        "ritual-spell-1": ritualSpellDef,
        "ritual-monster-1": ritualMonsterDef,
        "small-tribute-def": smallTributeDef,
      },
      hostHand: ["ritual-spell-1", "ritual-monster-1"],
      hostBoard: [smallTribute],
    });

    const command: Extract<Command, { type: "ACTIVATE_SPELL" }> = {
      type: "ACTIVATE_SPELL",
      cardId: "ritual-spell-1",
      targets: ["ritual-monster-1", "small-trib-1"],
    };

    const events = decideActivateSpell(state, "host", command);

    // Level 2 < Level 7, not enough tributes
    expect(events).toHaveLength(0);
  });

  it("ritual monster must be in hand", () => {
    const tribute = createBoardCard({
      cardId: "tribute-1",
      definitionId: "tribute-def",
    });

    const state = createMinimalState({
      cardLookup: {
        "ritual-spell-1": ritualSpellDef,
        "ritual-monster-1": ritualMonsterDef,
        "tribute-def": tributeMonsterDef,
      },
      // Ritual monster NOT in hand
      hostHand: ["ritual-spell-1"],
      hostBoard: [tribute],
      // Ritual monster is in graveyard, not in hand
      hostGraveyard: ["ritual-monster-1"],
    });

    const command: Extract<Command, { type: "ACTIVATE_SPELL" }> = {
      type: "ACTIVATE_SPELL",
      cardId: "ritual-spell-1",
      targets: ["ritual-monster-1", "tribute-1"],
    };

    const events = decideActivateSpell(state, "host", command);

    expect(events).toHaveLength(0);
  });

  it("tributes must be on board face-up", () => {
    const faceDownTribute = createBoardCard({
      cardId: "tribute-fd",
      definitionId: "tribute-def",
      faceDown: true,
    });

    const state = createMinimalState({
      cardLookup: {
        "ritual-spell-1": ritualSpellDef,
        "ritual-monster-1": ritualMonsterDef,
        "tribute-def": tributeMonsterDef,
      },
      hostHand: ["ritual-spell-1", "ritual-monster-1"],
      hostBoard: [faceDownTribute],
    });

    const command: Extract<Command, { type: "ACTIVATE_SPELL" }> = {
      type: "ACTIVATE_SPELL",
      cardId: "ritual-spell-1",
      targets: ["ritual-monster-1", "tribute-fd"],
    };

    const events = decideActivateSpell(state, "host", command);

    // Face-down tribute should not be valid
    expect(events).toHaveLength(0);
  });

  it("ritual summon fails without any tributes specified", () => {
    const state = createMinimalState({
      cardLookup: {
        "ritual-spell-1": ritualSpellDef,
        "ritual-monster-1": ritualMonsterDef,
      },
      hostHand: ["ritual-spell-1", "ritual-monster-1"],
      hostBoard: [],
    });

    const command: Extract<Command, { type: "ACTIVATE_SPELL" }> = {
      type: "ACTIVATE_SPELL",
      cardId: "ritual-spell-1",
      targets: ["ritual-monster-1"], // Only ritual monster, no tributes
    };

    const events = decideActivateSpell(state, "host", command);

    // Need at least 2 targets (ritual monster + 1 tribute)
    expect(events).toHaveLength(0);
  });

  it("ritual_activation_rejects_duplicate_tribute_ids", () => {
    const tribute = createBoardCard({
      cardId: "tribute-1",
      definitionId: "tribute-def",
    });

    const state = createMinimalState({
      cardLookup: {
        "ritual-spell-1": ritualSpellDef,
        "ritual-monster-1": ritualMonsterDef,
        "tribute-def": tributeMonsterDef,
      },
      hostHand: ["ritual-spell-1", "ritual-monster-1"],
      hostBoard: [tribute],
    });

    const command: Extract<Command, { type: "ACTIVATE_SPELL" }> = {
      type: "ACTIVATE_SPELL",
      cardId: "ritual-spell-1",
      targets: ["ritual-monster-1", "tribute-1", "tribute-1"],
    };

    const events = decideActivateSpell(state, "host", command);

    expect(events).toHaveLength(0);
    expect(events.some((event) => event.type === "RITUAL_SUMMONED")).toBe(false);
  });
});
