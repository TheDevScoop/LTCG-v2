import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@lunchtable/engine";
import type { GameState } from "@lunchtable/engine";
import { ensureInstanceMapping } from "../stateCompatibility";

function makeLegacyState(): GameState {
  return {
    config: DEFAULT_CONFIG,
    cardLookup: {
      c1: {
        id: "c1",
        name: "Card 1",
        type: "stereotype",
        description: "Fixture card",
        rarity: "common",
        attack: 1000,
        defense: 1000,
        level: 4,
      },
      c2: {
        id: "c2",
        name: "Card 2",
        type: "spell",
        description: "Fixture card",
        rarity: "common",
        spellType: "normal",
      },
    },
    instanceToDefinition: {} as Record<string, string>,
    hostId: "host",
    awayId: "away",
    hostHand: ["c1"],
    hostBoard: [{ cardId: "c1", definitionId: "c1", position: "attack", faceDown: false, canAttack: false, hasAttackedThisTurn: false, changedPositionThisTurn: false, viceCounters: 0, temporaryBoosts: { attack: 0, defense: 0 }, equippedCards: [], turnSummoned: 1 }],
    hostSpellTrapZone: [{ cardId: "c2", definitionId: "c2", faceDown: true, activated: false }],
    hostFieldSpell: null,
    hostDeck: [],
    hostGraveyard: [],
    hostBanished: [],
    awayHand: [],
    awayBoard: [],
    awaySpellTrapZone: [],
    awayFieldSpell: null,
    awayDeck: [],
    awayGraveyard: [],
    awayBanished: [],
    hostLifePoints: 8000,
    awayLifePoints: 8000,
    hostBreakdownsCaused: 0,
    awayBreakdownsCaused: 0,
    currentTurnPlayer: "host",
    turnNumber: 1,
    currentPhase: "draw",
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
  };
}

describe("ensureInstanceMapping", () => {
  it("upgrades legacy snapshots without instanceToDefinition", () => {
    const legacy = makeLegacyState();
    const upgraded = ensureInstanceMapping({
      ...(legacy as any),
      instanceToDefinition: undefined,
    });

    expect(upgraded.instanceToDefinition.c1).toBe("c1");
    expect(upgraded.instanceToDefinition.c2).toBe("c2");
  });
});
