import { describe, expect, it } from "vitest";
import type { GameState } from "@lunchtable/engine";
import {
  assertInitialStateIntegrity,
  haveSameCardCounts,
} from "../mutations";
import { DEFAULT_CONFIG } from "@lunchtable/engine";

function makeInitialState(overrides: Partial<GameState> = {}): GameState {
  const base = {
    config: DEFAULT_CONFIG,
    cardLookup: {
      h1: { id: "h1", name: "Host Hand", type: "stereotype", attack: 1000, defense: 1000, level: 4 },
      h2: { id: "h2", name: "Host Deck 1", type: "stereotype", attack: 1200, defense: 1000, level: 4 },
      h3: { id: "h3", name: "Host Deck 2", type: "stereotype", attack: 1400, defense: 1200, level: 4 },
      a1: { id: "a1", name: "Away Hand", type: "stereotype", attack: 500, defense: 1000, level: 3 },
      a2: { id: "a2", name: "Away Deck 1", type: "stereotype", attack: 800, defense: 1000, level: 4 },
      a3: { id: "a3", name: "Away Deck 2", type: "stereotype", attack: 700, defense: 900, level: 3 },
    },
    hostId: "host-user",
    awayId: "away-user",
    gameStarted: true,
    currentTurnPlayer: "host",
    turnNumber: 1,
    currentPhase: "draw",
    hostNormalSummonedThisTurn: false,
    awayNormalSummonedThisTurn: false,
    currentChain: [],
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
    hostLifePoints: 8000,
    awayLifePoints: 8000,
    hostBreakdownsCaused: 0,
    awayBreakdownsCaused: 0,
    hostFieldSpell: null,
    awayFieldSpell: null,
    hostHand: ["h1"],
    hostDeck: ["h2", "h3"],
    awayHand: ["a1"],
    awayDeck: ["a2", "a3"],
    hostBoard: [],
    awayBoard: [],
    hostSpellTrapZone: [],
    awaySpellTrapZone: [],
    hostGraveyard: [],
    awayGraveyard: [],
    hostBanished: [],
    awayBanished: [],
  };

  return {
    ...base,
    ...overrides,
  } as unknown as GameState;
}

describe("haveSameCardCounts", () => {
  it("matches card multisets regardless of ordering", () => {
    expect(haveSameCardCounts(["a", "b", "a"], ["b", "a", "a"])).toBe(true);
  });

  it("detects card count mismatches", () => {
    expect(haveSameCardCounts(["a", "b"], ["a", "a"])).toBe(false);
  });
});

describe("assertInitialStateIntegrity", () => {
  const match = {
    hostId: "host-user",
    awayId: "away-user",
    hostDeck: ["h1", "h2", "h3"],
    awayDeck: ["a1", "a2", "a3"],
  };

  it("accepts a consistent initial state", () => {
    expect(() => assertInitialStateIntegrity(match, makeInitialState())).not.toThrow();
  });

  it("rejects config tampering", () => {
    const state = makeInitialState({
      config: { ...DEFAULT_CONFIG, maxBoardSlots: DEFAULT_CONFIG.maxBoardSlots + 1 },
    });
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState.config does not match server defaults",
    );
  });

  it("rejects host identity mismatch", () => {
    const state = makeInitialState({ hostId: "different-host" });
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState hostId does not match match.hostId",
    );
  });

  it("rejects non-empty board/discard zones", () => {
    const state = makeInitialState({
      hostBoard: [{ cardId: "occupied" }],
    } as unknown as Partial<GameState>);
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState must start with empty board and discard zones",
    );
  });

  it("rejects deck/hand multiset mismatches", () => {
    const state = makeInitialState({
      hostDeck: ["h2"],
    });
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState host deck/hand does not match match.hostDeck",
    );
  });

  it("rejects non-empty current chain as invalid initial state", () => {
    const state = makeInitialState({
      currentChain: [{ cardId: "trap", effectIndex: 0, activatingPlayer: "host", targets: [] } as any],
    } as unknown as Partial<GameState>);
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState must start with no active chain",
    );
  });

  it("rejects open field spells or modifiers at match start", () => {
    const state = makeInitialState({
      hostFieldSpell: { cardId: "field", definitionId: "f1" } as any,
    } as unknown as Partial<GameState>);
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState must start with empty board and discard zones",
    );
  });

  it("rejects missing card definitions", () => {
    const state = makeInitialState({
      cardLookup: {
        h1: { id: "h1", name: "Host Hand", type: "stereotype", attack: 1000, defense: 1000, level: 4 },
      },
    } as unknown as Partial<GameState>);
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState.cardLookup missing definition for h2",
    );
  });

  it("rejects malformed stereotype definitions", () => {
    const state = makeInitialState({
      cardLookup: {
        h1: { id: "h1", name: "Host Hand", type: "stereotype", attack: 1000, defense: 1000, level: 4 },
        h2: { id: "h2", name: "Host Deck 1", type: "stereotype", attack: "invalid", defense: 1000, level: 4 } as any,
        h3: { id: "h3", name: "Host Deck 2", type: "stereotype", attack: 1400, defense: 1200, level: 4 },
        a1: { id: "a1", name: "Away Hand", type: "stereotype", attack: 500, defense: 1000, level: 3 },
        a2: { id: "a2", name: "Away Deck 1", type: "stereotype", attack: 800, defense: 1000, level: 4 },
        a3: { id: "a3", name: "Away Deck 2", type: "stereotype", attack: 700, defense: 900, level: 3 },
      },
    } as unknown as Partial<GameState>);
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(/initialState\.cardLookup has invalid definition/);
  });

  it("rejects malformed spell/trap definitions", () => {
    const state = makeInitialState({
      cardLookup: {
        h1: { id: "h1", name: "Host Hand", type: "stereotype", attack: 1000, defense: 1000, level: 4 },
        h2: { id: "h2", name: "Host Deck 1", type: "spell" },
        h3: { id: "h3", name: "Host Deck 2", type: "stereotype", attack: 1400, defense: 1200, level: 4 },
        a1: { id: "a1", name: "Away Hand", type: "stereotype", attack: 500, defense: 1000, level: 3 },
        a2: { id: "a2", name: "Away Deck 1", type: "stereotype", attack: 800, defense: 1000, level: 4 },
        a3: { id: "a3", name: "Away Deck 2", type: "stereotype", attack: 700, defense: 900, level: 3 },
      },
    } as unknown as Partial<GameState>);
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(/initialState\.cardLookup has invalid definition/);
  });
});
