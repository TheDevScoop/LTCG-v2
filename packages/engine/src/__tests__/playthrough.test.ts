import { describe, it, expect } from "vitest";
import { createEngine } from "../engine.js";
import { defineCards } from "../cards.js";
import type { CardDefinition, Command, EngineEvent, GameState } from "../types/index.js";
import { DEFAULT_CONFIG } from "../types/config.js";

const ATTACK_POWER = 2500;
const MONSTER_LEVEL = 4;
const MAX_TURNS = 20;
const SEED = 2026;

function buildMonsters(prefix: string, count: number): CardDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    name: `${prefix} attacker ${index + 1}`,
    type: "stereotype",
    description: "playtest monster",
    rarity: "common",
    attack: ATTACK_POWER,
    defense: 1000,
    level: MONSTER_LEVEL,
    attribute: "fire",
  }));
}

const hostDeckDefinitionIds = Array.from({ length: 40 }, (_, index) => `host-${index + 1}`);
const awayDeckDefinitionIds = Array.from({ length: 40 }, (_, index) => `away-${index + 1}`);

const CARD_LOOKUP = defineCards([
  ...buildMonsters("host", 40),
  ...buildMonsters("away", 40).map((card, index) => ({
    ...card,
    attack: 600,
    defense: 600,
    id: awayDeckDefinitionIds[index],
    name: `away blocker ${index + 1}`,
    description: "playtest blocker",
    level: 3,
    attribute: "water",
  })),
]);

function runPlaythrough(seed: number, maxTurns = MAX_TURNS) {
  const events: EngineEvent[] = [];
  const engine = createEngine({
    cardLookup: CARD_LOOKUP,
    hostId: "host-player",
    awayId: "away-player",
    hostDeck: hostDeckDefinitionIds,
    awayDeck: awayDeckDefinitionIds,
    seed,
  });

  function execute(command: Command): EngineEvent[] {
    const state = engine.getState();
    const nextEvents = engine.decide(command, state.currentTurnPlayer);
    events.push(...nextEvents);
    engine.evolve(nextEvents);
    return nextEvents;
  }

  function advanceToPhase(targetPhase: GameState["currentPhase"], maxSteps = 20): void {
    for (let step = 0; step < maxSteps; step += 1) {
      const state = engine.getState();
      if (state.gameOver || state.currentPhase === targetPhase) {
        return;
      }
      const nextEvents = execute({ type: "ADVANCE_PHASE" });
      expect(nextEvents.length).toBeGreaterThan(0);
    }
    throw new Error(`Unable to reach ${targetPhase}`);
  }

  function playHostTurn() {
    advanceToPhase("main");
    const stateAtMain = engine.getState();

    if (stateAtMain.hostBoard.length < 2 && stateAtMain.hostHand.length > 0) {
      execute({ type: "SUMMON", cardId: stateAtMain.hostHand[0]!, position: "attack" });
    }

    advanceToPhase("combat");

    const stateAtCombat = engine.getState();
    if (!stateAtCombat.gameOver && stateAtCombat.turnNumber > 1 && stateAtCombat.awayBoard.every((card) => card.faceDown)) {
      const attacker = stateAtCombat.hostBoard.find(
        (card) => card.canAttack && !card.hasAttackedThisTurn && !card.faceDown
      );

      if (attacker) {
        execute({ type: "DECLARE_ATTACK", attackerId: attacker.cardId });
      }
    }

    if (!engine.getState().gameOver) {
      advanceToPhase("end");
      execute({ type: "END_TURN" });
    }
  }

  function playAwayTurn() {
    if (engine.getState().gameOver) {
      return;
    }
    advanceToPhase("end");
    execute({ type: "END_TURN" });
  }

  let turns = 0;
  while (!engine.getState().gameOver && turns < maxTurns) {
    const state = engine.getState();
    if (state.currentTurnPlayer === "host") {
      playHostTurn();
    } else {
      playAwayTurn();
    }
    turns += 1;
  }

  return {
    events,
    finalState: engine.getState(),
    turns,
  };
}

describe("Engine playthrough", () => {
  it("plays a full deterministic game to LP-zero with valid engine events", () => {
    const { events, finalState } = runPlaythrough(SEED);

    const summonEvents = events.filter((event): event is Extract<EngineEvent, { type: "MONSTER_SUMMONED" }> =>
      event.type === "MONSTER_SUMMONED"
    );
    const attackEvents = events.filter((event): event is Extract<EngineEvent, { type: "ATTACK_DECLARED" }> =>
      event.type === "ATTACK_DECLARED"
    );
    const damageEvents = events.filter((event): event is Extract<EngineEvent, { type: "DAMAGE_DEALT" }> =>
      event.type === "DAMAGE_DEALT"
    );
    const awayDamageEvents = damageEvents.filter((event) => event.seat === "away");
    const damageAmount = damageEvents.reduce((sum, event) => sum + event.amount, 0);
    const awayDamageAmount = awayDamageEvents.reduce((sum, event) => sum + event.amount, 0);
    const requiredAttacks = Math.ceil(DEFAULT_CONFIG.startingLP / ATTACK_POWER);

    expect(finalState.gameOver).toBe(true);
    expect(finalState.winner).toBe("host");
    expect(finalState.winReason).toBe("lp_zero");
    expect(finalState.awayLifePoints).toBeLessThanOrEqual(0);
    expect(damageAmount).toBeGreaterThanOrEqual(DEFAULT_CONFIG.startingLP);
    expect(attackEvents.length).toBe(damageEvents.length);
    expect(attackEvents.length).toBeGreaterThanOrEqual(requiredAttacks);
    expect(attackEvents.every((event) => event.targetId === null)).toBe(true);
    expect(awayDamageEvents.every((event) => event.seat === "away")).toBe(true);
    expect(awayDamageAmount).toBeGreaterThanOrEqual(DEFAULT_CONFIG.startingLP);
    expect(finalState.awayLifePoints).toBe(0);
    expect(summonEvents.length).toBeGreaterThan(1);
    expect(new Set(summonEvents.map((event) => event.cardId)).size).toBe(summonEvents.length);
  });

  it("replays identically with the same seed", () => {
    const first = runPlaythrough(SEED);
    const second = runPlaythrough(SEED);

    expect(first.finalState.awayLifePoints).toBe(second.finalState.awayLifePoints);
    expect(first.finalState.gameOver).toBe(second.finalState.gameOver);
    expect(first.finalState.winner).toBe(second.finalState.winner);
    expect(first.finalState.winReason).toBe(second.finalState.winReason);
    expect(first.finalState.turnNumber).toBe(second.finalState.turnNumber);
    expect(first.events.map((event) => JSON.stringify(event))).toEqual(
      second.events.map((event) => JSON.stringify(event))
    );
  });

  it("resolves duplicate on-board attacker instances with one exhausted instance", () => {
    const engine = createEngine({
      cardLookup: CARD_LOOKUP,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: hostDeckDefinitionIds,
      awayDeck: awayDeckDefinitionIds,
      firstPlayer: "host",
      seed: SEED,
    });

    const state = engine.getState();
    state.currentTurnPlayer = "host";
    state.currentPhase = "combat";
    state.turnNumber = 2;
    state.hostBoard = [
      {
        cardId: "host-1",
        definitionId: "host-1",
        position: "attack",
        faceDown: false,
        canAttack: true,
        hasAttackedThisTurn: true,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: state.turnNumber,
      },
      {
        cardId: "host-1",
        definitionId: "host-1",
        position: "attack",
        faceDown: false,
        canAttack: true,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: state.turnNumber,
      },
    ];
    state.awayBoard = [
      {
        cardId: "away-1",
        definitionId: "away-1",
        position: "attack",
        faceDown: false,
        canAttack: true,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: state.turnNumber,
      },
    ];

    const events = engine.decide({ type: "DECLARE_ATTACK", attackerId: "host-1", targetId: "away-1" }, "host");
    expect(events[0]).toMatchObject({
      type: "ATTACK_DECLARED",
      attackerId: "host-1",
      targetId: "away-1",
    });
    expect(events).toHaveLength(5);

    engine.evolve(events);
    const evolved = engine.getState();
    expect(evolved.hostBoard).toHaveLength(2);
    expect(evolved.hostBoard[1].hasAttackedThisTurn).toBe(true);
    expect(evolved.awayLifePoints).toBeLessThan(DEFAULT_CONFIG.startingLP);
  });
});
