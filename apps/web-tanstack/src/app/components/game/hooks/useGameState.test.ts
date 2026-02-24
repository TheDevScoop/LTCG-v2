import { describe, expect, it } from "vitest";
import type { PlayerView } from "../../../lib/convexTypes";

import { deriveValidActions } from "./deriveValidActions";
import { parsePlayerView } from "./useGameState";

describe("deriveValidActions", () => {
  it("suppresses summon/set monster actions when monster board is full", () => {
    const view = {
      hand: ["monster-in-hand", "monster-in-hand-2", "normal-spell"],
      board: [
        { cardId: "m1", turnSummoned: 1, faceDown: false, canAttack: false, hasAttackedThisTurn: false },
        { cardId: "m2", turnSummoned: 1, faceDown: false, canAttack: false, hasAttackedThisTurn: false },
        { cardId: "m3", turnSummoned: 1, faceDown: false, canAttack: false, hasAttackedThisTurn: false },
        { cardId: "m4", turnSummoned: 1, faceDown: false, canAttack: false, hasAttackedThisTurn: false },
        { cardId: "m5", turnSummoned: 1, faceDown: false, canAttack: false, hasAttackedThisTurn: false },
      ],
      spellTrapZone: [],
      opponentBoard: [],
      maxBoardSlots: 3,
      maxSpellTrapSlots: 3,
      currentTurnPlayer: "host",
      currentPriorityPlayer: "host",
      turnNumber: 3,
      currentPhase: "main",
      currentChain: [],
      mySeat: "host",
      gameOver: false,
      handSize: 0,
    } as unknown as PlayerView;

    const cardLookup = {
      "monster-in-hand": {
        _id: "monster-in-hand",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Mock Monster",
        level: 4,
      },
      "monster-in-hand-2": {
        _id: "monster-in-hand-2",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Second Monster",
        level: 5,
      },
      "normal-spell": {
        _id: "normal-spell",
        type: "spell",
        cardType: "spell",
        cardName: "Normal Spell",
      },
    } as Record<string, any>;

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: true,
      gameOver: false,
    });

    expect(result.canSummon.size).toBe(0);
    expect(result.canSetMonster.size).toBe(0);
  });

  it("derives summon limits from view maxBoardSlots", () => {
    const view = {
      hand: ["monster-in-hand"],
      board: [{ cardId: "m1", turnSummoned: 1, faceDown: false, canAttack: false, hasAttackedThisTurn: false }],
      spellTrapZone: [],
      opponentBoard: [],
      maxBoardSlots: 1,
      maxSpellTrapSlots: 3,
      currentTurnPlayer: "host",
      currentPriorityPlayer: "host",
      turnNumber: 3,
      currentPhase: "main",
      currentChain: [],
      mySeat: "host",
      gameOver: false,
      handSize: 0,
    } as unknown as PlayerView;

    const cardLookup = {
      "monster-in-hand": {
        _id: "monster-in-hand",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Mock Monster",
        level: 4,
      },
    } as Record<string, any>;

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: true,
      gameOver: false,
    });

    expect(result.canSummon.size).toBe(0);
    expect(result.canSetMonster.size).toBe(0);
  });

  it("blocks normal summon actions after a normal summon was already used", () => {
    const view = {
      hand: ["monster-in-hand"],
      board: [],
      spellTrapZone: [],
      opponentBoard: [],
      maxBoardSlots: 3,
      maxSpellTrapSlots: 3,
      normalSummonedThisTurn: true,
      currentTurnPlayer: "host",
      currentPriorityPlayer: "host",
      turnNumber: 3,
      currentPhase: "main",
      currentChain: [],
      mySeat: "host",
      gameOver: false,
      handSize: 0,
    } as unknown as PlayerView;

    const cardLookup = {
      "monster-in-hand": {
        _id: "monster-in-hand",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Mock Monster",
        level: 4,
      },
    } as Record<string, any>;

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: true,
      gameOver: false,
    });

    expect(result.canSummon.size).toBe(0);
    expect(result.canSetMonster.size).toBe(0);
  });

  it("uses maxSpellTrapSlots from view when evaluating spell trap set capacity", () => {
    const view = {
      hand: ["normal-spell"],
      board: [],
      spellTrapZone: [
        {
          cardId: "st1",
          definitionId: "st-1",
          cardName: "Face-up spell",
          faceDown: false,
          canAttack: false,
          hasAttackedThisTurn: false,
          position: "attack",
          temporaryBoosts: { attack: 0, defense: 0 },
          turnSummoned: 1,
          location: "spell_trap_zone",
          turnSet: 1,
        } as any,
      ],
      opponentBoard: [],
      maxBoardSlots: 3,
      maxSpellTrapSlots: 1,
      currentTurnPlayer: "host",
      currentPriorityPlayer: "host",
      turnNumber: 3,
      currentPhase: "main",
      currentChain: [],
      mySeat: "host",
      gameOver: false,
      handSize: 0,
    } as unknown as PlayerView;

    const cardLookup = {
      "normal-spell": {
        _id: "normal-spell",
        type: "spell",
        cardType: "spell",
        cardName: "Normal Spell",
      },
    } as Record<string, any>;

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: true,
      gameOver: false,
    });

    expect(result.canSetSpellTrap.size).toBe(0);
    expect(result.canActivateSpell.size).toBe(0);
  });

  it("suppresses all actions when chain window is active and player is not chain responder", () => {
    const view = {
      hand: ["monster-in-hand"],
      board: [],
      spellTrapZone: [],
      opponentBoard: [],
      currentTurnPlayer: "host",
      currentPriorityPlayer: "away",
      turnNumber: 3,
      currentPhase: "main",
      currentChain: [{ seat: "away", command: { type: "DRAW" } }],
      mySeat: "host",
      gameOver: false,
      handSize: 0,
    } as unknown as PlayerView;

    const cardLookup = {
      "monster-in-hand": {
        _id: "monster-in-hand",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Mock Monster",
        level: 4,
      },
    } as Record<string, any>;

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: true,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canSummon.size).toBe(0);
    expect(result.canSetMonster.size).toBe(0);
    expect(result.canAttack.size).toBe(0);
  });

  it("handles missing turnSummoned when deriving flip-summon actions", () => {
    const view = {
      hand: ["monster-in-hand"],
      board: [
        {
          cardId: "m1",
          faceDown: true,
          canAttack: false,
          hasAttackedThisTurn: false,
          definitionId: "m1",
          turnSummoned: undefined,
        },
      ],
      spellTrapZone: [],
      opponentBoard: [],
      currentTurnPlayer: "host",
      currentPriorityPlayer: "host",
      turnNumber: 3,
      currentPhase: "main",
      currentChain: [],
      mySeat: "host",
      gameOver: false,
      handSize: 0,
    } as unknown as PlayerView;

    const cardLookup = {
      "monster-in-hand": {
        _id: "monster-in-hand",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Mock Monster",
        level: 4,
      },
      m1: {
        _id: "m1",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "On board monster",
        level: 4,
      },
    } as Record<string, any>;

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: true,
      gameOver: false,
    });

    expect(result.canSummon.size).toBe(1);
    expect(result.canFlipSummon.has("m1")).toBe(true);
  });

  it("returns deterministic action-set structure", () => {
    const view = {
      hand: ["monster-in-hand", "normal-spell", "normal-spell-2"],
      board: [
        {
          cardId: "board-monster",
          faceDown: false,
          canAttack: true,
          hasAttackedThisTurn: false,
        },
      ],
      spellTrapZone: [],
      opponentBoard: [{ cardId: "op-monster", faceDown: false, canAttack: false, hasAttackedThisTurn: false }],
      currentTurnPlayer: "host",
      currentPriorityPlayer: "host",
      turnNumber: 3,
      currentPhase: "combat",
      currentChain: [],
      mySeat: "host",
      gameOver: false,
      handSize: 0,
    } as unknown as PlayerView;

    const cardLookup = {
      "monster-in-hand": {
        _id: "monster-in-hand",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Mock Monster",
        level: 4,
      },
      "normal-spell": {
        _id: "normal-spell",
        type: "spell",
        cardType: "spell",
        cardName: "Normal Spell",
      },
      "normal-spell-2": {
        _id: "normal-spell-2",
        type: "spell",
        cardType: "spell",
        cardName: "Second Spell",
      },
      "board-monster": {
        _id: "board-monster",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Board Monster",
        level: 4,
      },
      "op-monster": {
        _id: "op-monster",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Opponent Monster",
        level: 4,
      },
    } as Record<string, any>;

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: true,
      gameOver: false,
    });

    expect(result.canSummon instanceof Map).toBe(true);
    expect(result.canSetMonster instanceof Set).toBe(true);
    expect(result.canSetSpellTrap instanceof Set).toBe(true);
    expect(result.canActivateSpell instanceof Set).toBe(true);
    expect(result.canAttack instanceof Map).toBe(true);
    expect(Array.from(result.canAttack.keys())).toEqual(["board-monster"]);
    expect(result.canSummon.size).toBe(0);
    expect(result.canSetMonster.size).toBe(0);
    expect(result.canSetSpellTrap.size).toBe(0);
    expect(result.canAttack.get("board-monster")).toEqual(["op-monster"]);
  });
});

describe("parsePlayerView", () => {
  it("sets parseError on invalid view JSON", () => {
    const parsed = parsePlayerView("{not-valid-json");
    expect(parsed.view).toBeNull();
    expect(parsed.parseError).toContain("Failed to parse");
  });

  it("parses instanceDefinitions map", () => {
    const parsed = parsePlayerView(
      JSON.stringify({
        hand: ["h:1:monster"],
        board: [],
        spellTrapZone: [],
        fieldSpell: null,
        graveyard: [],
        banished: [],
        lifePoints: 8000,
        deckCount: 35,
        breakdownsCaused: 0,
        opponentHandCount: 5,
        opponentBoard: [],
        opponentSpellTrapZone: [],
        opponentFieldSpell: null,
        opponentGraveyard: [],
        opponentBanished: [],
        opponentLifePoints: 8000,
        opponentDeckCount: 35,
        opponentBreakdownsCaused: 0,
        currentTurnPlayer: "host",
        currentPriorityPlayer: null,
        turnNumber: 1,
        currentPhase: "draw",
        currentChain: [],
        normalSummonedThisTurn: false,
        maxBoardSlots: 3,
        maxSpellTrapSlots: 3,
        mySeat: "host",
        gameOver: false,
        winner: null,
        winReason: null,
        pendingPong: null,
        pendingRedemption: null,
        instanceDefinitions: {
          "h:1:monster": "monster_def",
        },
      }),
    );
    expect(parsed.parseError).toBeNull();
    expect(parsed.view?.instanceDefinitions["h:1:monster"]).toBe("monster_def");
  });
});
