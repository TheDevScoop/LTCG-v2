import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { createEngine, createInitialState, decide, evolve } from "../engine.js";
import { DEFAULT_CONFIG } from "../types/config.js";
import type {
  BoardCard,
  CardDefinition,
  Command,
  EngineConfig,
  EngineEvent,
  GameState,
} from "../types/index.js";

const CARD_LOOKUP: Record<string, CardDefinition> = {
  host_attacker: {
    id: "host_attacker",
    name: "Host Attacker",
    type: "stereotype",
    description: "golden host monster",
    rarity: "common",
    attack: 2500,
    defense: 1000,
    level: 4,
    attribute: "fire",
  },
  away_blocker: {
    id: "away_blocker",
    name: "Away Blocker",
    type: "stereotype",
    description: "golden away monster",
    rarity: "common",
    attack: 600,
    defense: 600,
    level: 3,
    attribute: "water",
  },
  trap_damage: {
    id: "trap_damage",
    name: "Damage Trap",
    type: "trap",
    trapType: "normal",
    rarity: "common",
    description: "Deal 500 damage",
    effects: [
      {
        id: "trap_damage_effect",
        type: "trigger",
        description: "Deal 500 damage",
        actions: [{ type: "damage", amount: 500, target: "opponent" }],
      },
    ],
  },
  ritual_spell: {
    id: "ritual_spell",
    name: "Ritual Spell",
    type: "spell",
    spellType: "ritual",
    rarity: "common",
    description: "Ritual summon",
    effects: [],
  },
  ritual_monster: {
    id: "ritual_monster",
    name: "Golden Ritual",
    type: "stereotype",
    rarity: "rare",
    description: "Ritual payoff",
    attack: 2600,
    defense: 2000,
    level: 7,
    attribute: "light",
  },
  tribute_monster: {
    id: "tribute_monster",
    name: "Tribute Body",
    type: "stereotype",
    rarity: "common",
    description: "Tribute source",
    attack: 1200,
    defense: 1000,
    level: 4,
    attribute: "earth",
  },
};

const HOST_DECK = Array.from({ length: 40 }, () => "host_attacker");
const AWAY_DECK = Array.from({ length: 40 }, () => "away_blocker");
const GOLDEN_SEED = 2026;

function hashEvents(events: EngineEvent[]): string {
  const joined = events.map((event) => JSON.stringify(event)).join("\n");
  return createHash("sha256").update(joined).digest("hex");
}

function createScenarioState(args?: {
  config?: Partial<EngineConfig>;
  state?: Partial<GameState>;
}): GameState {
  const config = { ...DEFAULT_CONFIG, ...(args?.config ?? {}) };
  const base = createInitialState(CARD_LOOKUP, config, "host", "away", HOST_DECK, AWAY_DECK, "host");

  return {
    ...base,
    ...(args?.state ?? {}),
    config,
    cardLookup: CARD_LOOKUP,
  };
}

function runGoldenStoryStageLikeFlow(seed = GOLDEN_SEED) {
  const events: EngineEvent[] = [];
  const engine = createEngine({
    cardLookup: CARD_LOOKUP,
    hostId: "host-player",
    awayId: "away-player",
    hostDeck: HOST_DECK,
    awayDeck: AWAY_DECK,
    seed,
    firstPlayer: "host",
  });

  const execute = (command: Command) => {
    const seat = engine.getState().currentTurnPlayer;
    const next = engine.decide(command, seat);
    events.push(...next);
    engine.evolve(next);
    return next;
  };

  const advanceToPhase = (target: GameState["currentPhase"], maxSteps = 20) => {
    for (let i = 0; i < maxSteps; i += 1) {
      const state = engine.getState();
      if (state.gameOver || state.currentPhase === target) {
        return;
      }
      const next = execute({ type: "ADVANCE_PHASE" });
      expect(next.length).toBeGreaterThan(0);
    }
    throw new Error(`unable to reach phase ${target}`);
  };

  let turns = 0;
  while (!engine.getState().gameOver && turns < 20) {
    const state = engine.getState();
    if (state.currentTurnPlayer === "host") {
      advanceToPhase("main");
      const atMain = engine.getState();
      if (atMain.hostBoard.length < 1 && atMain.hostHand.length > 0) {
        execute({ type: "SUMMON", cardId: atMain.hostHand[0]!, position: "attack" });
      }

      advanceToPhase("combat");
      const atCombat = engine.getState();
      const attacker = atCombat.hostBoard.find(
        (card) => !card.faceDown && card.canAttack && !card.hasAttackedThisTurn,
      );

      if (attacker && atCombat.turnNumber > 1 && atCombat.awayBoard.every((card) => card.faceDown)) {
        execute({ type: "DECLARE_ATTACK", attackerId: attacker.cardId });
      }

      if (!engine.getState().gameOver) {
        advanceToPhase("end");
        execute({ type: "END_TURN" });
      }
    } else {
      advanceToPhase("end");
      execute({ type: "END_TURN" });
    }

    turns += 1;
  }

  return {
    events,
    finalState: engine.getState(),
    turns,
  };
}

describe("deterministic golden scenarios", () => {
  it("golden_valid_story_stage_like_flow", () => {
    const first = runGoldenStoryStageLikeFlow();
    const second = runGoldenStoryStageLikeFlow();

    const firstHash = hashEvents(first.events);
    const secondHash = hashEvents(second.events);

    expect(first.finalState.gameOver).toBe(true);
    expect(first.finalState.winner).toBe("host");
    expect(first.finalState.winReason).toBe("lp_zero");
    expect(firstHash).toBe(secondHash);
    expect(first.events.length).toBeGreaterThan(0);
    expect(first.turns).toBeLessThanOrEqual(20);
  });

  it("golden_valid_chain_flow", () => {
    let state = createScenarioState({
      state: {
        currentPhase: "main",
        currentTurnPlayer: "host",
        hostSpellTrapZone: [
          { cardId: "trap_damage", definitionId: "trap_damage", faceDown: true, activated: false },
        ],
        awaySpellTrapZone: [
          { cardId: "trap_damage", definitionId: "trap_damage", faceDown: true, activated: false },
        ],
      },
    });

    const hostActivate = decide(state, { type: "ACTIVATE_TRAP", cardId: "trap_damage", targets: [] }, "host");
    expect(hostActivate.map((event) => event.type)).toEqual([
      "CHAIN_STARTED",
      "CHAIN_LINK_ADDED",
      "TRAP_ACTIVATED",
    ]);
    state = evolve(state, hostActivate);

    const awayRespond = decide(state, { type: "CHAIN_RESPONSE", cardId: "trap_damage", pass: false }, "away");
    expect(awayRespond.map((event) => event.type)).toEqual(["CHAIN_LINK_ADDED", "TRAP_ACTIVATED"]);
    state = evolve(state, awayRespond);

    const hostPass = decide(state, { type: "CHAIN_RESPONSE", pass: true }, "host");
    expect(hostPass.map((event) => event.type)).toEqual(["CHAIN_PASSED"]);
    state = evolve(state, hostPass);

    const awayPass = decide(state, { type: "CHAIN_RESPONSE", pass: true }, "away");
    expect(awayPass.map((event) => event.type)).toEqual([
      "CHAIN_PASSED",
      "CHAIN_RESOLVED",
      "DAMAGE_DEALT",
      "DAMAGE_DEALT",
    ]);
    state = evolve(state, awayPass);

    expect(state.currentChain).toHaveLength(0);
    expect(state.hostLifePoints).toBe(7500);
    expect(state.awayLifePoints).toBe(7500);
  });

  it("golden_valid_ritual_flow", () => {
    const tribute1: BoardCard = {
      cardId: "tribute_1",
      definitionId: "tribute_monster",
      position: "attack",
      faceDown: false,
      canAttack: true,
      hasAttackedThisTurn: false,
      changedPositionThisTurn: false,
      viceCounters: 0,
      temporaryBoosts: { attack: 0, defense: 0 },
      equippedCards: [],
      turnSummoned: 1,
    };

    const tribute2: BoardCard = {
      ...tribute1,
      cardId: "tribute_2",
    };

    let state = createScenarioState({
      state: {
        currentPhase: "main",
        currentTurnPlayer: "host",
        hostHand: ["ritual_spell", "ritual_monster"],
        hostBoard: [tribute1, tribute2],
      },
    });

    const events = decide(
      state,
      {
        type: "ACTIVATE_SPELL",
        cardId: "ritual_spell",
        targets: ["ritual_monster", "tribute_1", "tribute_2"],
      },
      "host",
    );

    expect(events.map((event) => event.type)).toEqual([
      "SPELL_ACTIVATED",
      "CARD_DESTROYED",
      "CARD_SENT_TO_GRAVEYARD",
      "CARD_DESTROYED",
      "CARD_SENT_TO_GRAVEYARD",
      "RITUAL_SUMMONED",
    ]);

    state = evolve(state, events);

    expect(state.hostBoard.some((card) => card.cardId === "ritual_monster")).toBe(true);
    expect(state.hostBoard.some((card) => card.cardId === "tribute_1")).toBe(false);
    expect(state.hostBoard.some((card) => card.cardId === "tribute_2")).toBe(false);
    expect(state.hostGraveyard).toEqual(expect.arrayContaining(["ritual_spell", "tribute_1", "tribute_2"]));
  });

  it("golden_invalid_action_no_state_change", () => {
    const state = createScenarioState();
    const snapshot = structuredClone(state);

    const invalid = decide(
      state,
      { type: "SUMMON", cardId: state.awayHand[0]!, position: "attack" },
      "away",
    );

    expect(invalid).toEqual([]);

    const evolved = evolve(state, invalid);
    expect(evolved).toEqual(snapshot);
  });
});
