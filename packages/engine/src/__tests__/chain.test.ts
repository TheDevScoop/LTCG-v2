import { describe, it, expect } from "vitest";
import { createInitialState, decide, evolve, legalMoves } from "../engine.js";
import { DEFAULT_CONFIG } from "../types/config.js";
import type { GameState, SpellTrapCard } from "../types/state.js";

const lookup = {
  "m1": {
    id: "m1",
    name: "M1",
    type: "stereotype" as const,
    level: 4,
    attack: 1500,
    defense: 1000,
    rarity: "common" as const,
    archetype: "dropouts",
    description: "Test monster",
  },
  "trap1": {
    id: "trap1",
    name: "Counter Trap",
    type: "trap" as const,
    trapType: "normal" as const,
    rarity: "common" as const,
    archetype: "dropouts",
    description: "Test trap",
    effects: [{
      id: "trap1_effect",
      type: "trigger" as const,
      description: "Destroy target",
      targetCount: 1,
      actions: [{ type: "destroy" as const, target: "selected" as const }],
    }],
  },
  "trap2": {
    id: "trap2",
    name: "Damage Trap",
    type: "trap" as const,
    trapType: "normal" as const,
    rarity: "common" as const,
    archetype: "preps",
    description: "Test trap",
    effects: [{
      id: "trap2_effect",
      type: "trigger" as const,
      description: "Deal damage",
      actions: [{ type: "damage" as const, amount: 500, target: "opponent" as const }],
    }],
  },
  "trap3": {
    id: "trap3",
    name: "Choice Trap",
    type: "trap" as const,
    trapType: "normal" as const,
    rarity: "common" as const,
    archetype: "dropouts",
    description: "Multi effect trap",
    effects: [
      {
        id: "trap3_effect_a",
        type: "trigger" as const,
        description: "Destroy target",
        targetCount: 1,
        actions: [{ type: "destroy" as const, target: "selected" as const }],
      },
      {
        id: "trap3_effect_b",
        type: "trigger" as const,
        description: "Deal damage",
        actions: [{ type: "damage" as const, amount: 300, target: "opponent" as const }],
      },
    ],
  },
};

function makeState(overrides: Partial<GameState> = {}): GameState {
  const hostDeck = Array(35).fill("m1");
  const awayDeck = Array(35).fill("m1");
  const base = createInitialState(lookup, DEFAULT_CONFIG, "h", "a", hostDeck, awayDeck, "host");
  return { ...base, ...overrides, cardLookup: lookup };
}

function setTrapInZone(state: GameState, seat: "host" | "away", cardId: string, definitionId: string): GameState {
  const trap: SpellTrapCard = { cardId, definitionId, faceDown: true, activated: false };
  if (seat === "host") {
    return { ...state, hostSpellTrapZone: [...state.hostSpellTrapZone, trap] };
  }
  return { ...state, awaySpellTrapZone: [...state.awaySpellTrapZone, trap] };
}

describe("chain system", () => {
  it("ACTIVATE_TRAP starts a chain and defers resolution", () => {
    let state = makeState({ currentPhase: "main" });
    state = setTrapInZone(state, "host", "trap1", "trap1");

    const events = decide(
      state,
      { type: "ACTIVATE_TRAP", cardId: "trap1", targets: ["target1"] },
      "host",
    );
    expect(events.map((event) => event.type)).toEqual([
      "CHAIN_STARTED",
      "CHAIN_LINK_ADDED",
      "TRAP_ACTIVATED",
    ]);
    expect(events.some((event) => event.type === "CARD_DESTROYED")).toBe(false);

    const evolved = evolve(state, events);
    expect(evolved.currentChain).toHaveLength(1);
    expect(evolved.currentPriorityPlayer).toBe("away");
  });

  it("CHAIN_RESPONSE with pass emits CHAIN_PASSED", () => {
    let state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: ["target1"],
      }],
      currentPriorityPlayer: "host",
    });
    const events = decide(state, { type: "CHAIN_RESPONSE", pass: true }, "host");
    expect(events.some(e => e.type === "CHAIN_PASSED")).toBe(true);
  });

  it("CHAIN_RESPONSE first pass does not resolve chain", () => {
    let state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: ["target1"],
      }],
      currentPriorityPlayer: "away",
    });
    const events = decide(state, { type: "CHAIN_RESPONSE", pass: true }, "away");
    expect(events.some(e => e.type === "CHAIN_RESOLVED")).toBe(false);
  });

  it("CHAIN_RESPONSE resolves chain on opposite-seat second pass", () => {
    const state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: ["target1"],
      }],
      currentChainPasser: "host",
      currentPriorityPlayer: "away",
    });
    const events = decide(state, { type: "CHAIN_RESPONSE", pass: true }, "away");
    expect(events.some(e => e.type === "CHAIN_PASSED")).toBe(true);
    expect(events.some(e => e.type === "CHAIN_RESOLVED")).toBe(true);
  });

  it("supports mixed CHAIN_RESPONSE pass/link/pass sequence", () => {
    let state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "away",
        targets: ["target_from_trap1"],
      }],
      currentPriorityPlayer: "host",
    });
    state = setTrapInZone(state, "host", "trap3", "trap3");

    const addLinkEvents = decide(
      state,
      {
        type: "CHAIN_RESPONSE",
        cardId: "trap3",
        pass: false,
        chainLink: 1,
      },
      "host",
    );

    state = evolve(state, addLinkEvents);
    expect(state.currentChain.length).toBe(2);
    expect(state.currentPriorityPlayer).toBe("away");
    expect(state.currentChainPasser).toBeNull();
    expect(state.currentChain[1].effectIndex).toBe(1);

    const awayPassEvents = decide(
      state,
      { type: "CHAIN_RESPONSE", pass: true },
      "away",
    );
    expect(awayPassEvents.some((event) => event.type === "CHAIN_RESOLVED")).toBe(false);
    state = evolve(state, awayPassEvents);
    expect(state.currentChainPasser).toBe("away");

    const hostPassEvents = decide(
      state,
      { type: "CHAIN_RESPONSE", pass: true },
      "host",
    );
    expect(hostPassEvents.some((event) => event.type === "CHAIN_RESOLVED")).toBe(true);

    const chainResolvedIdx = hostPassEvents.findIndex((event) => event.type === "CHAIN_RESOLVED");
    const afterResolve = hostPassEvents.slice(chainResolvedIdx + 1);

    // Host added trap3 as effect index 1 (damage), so damage should resolve before trap1 destroy.
    const damageIdx = afterResolve.findIndex((event) => event.type === "DAMAGE_DEALT");
    expect(damageIdx).toBeGreaterThanOrEqual(0);
  });

  it("CHAIN_RESPONSE with cardId adds chain link", () => {
    let state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: ["target_from_trap1"],
      }],
      currentPriorityPlayer: "host",
    });
    state = setTrapInZone(state, "host", "trap1", "trap1");

    const events = decide(state, { type: "CHAIN_RESPONSE", cardId: "trap1", pass: false }, "host");
    expect(events.some(e => e.type === "CHAIN_LINK_ADDED")).toBe(true);
    expect(events.some(e => e.type === "TRAP_ACTIVATED")).toBe(true);
  });

  it("supports CHAIN_RESPONSE with effectIndex and targets", () => {
    let state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: ["target_from_trap1"],
      }],
      currentPriorityPlayer: "host",
    });
    state = setTrapInZone(state, "host", "trap3", "trap3");

    const events = decide(state, {
      type: "CHAIN_RESPONSE",
      cardId: "trap3",
      pass: false,
      effectIndex: 1,
      targets: ["targetA", "targetB"],
    }, "host");

    const chainLink = events.find((event) => event.type === "CHAIN_LINK_ADDED");
    expect(chainLink).toBeDefined();
    if (chainLink?.type === "CHAIN_LINK_ADDED") {
      expect(chainLink.effectIndex).toBe(1);
      expect(chainLink.targets).toEqual(["targetA", "targetB"]);
    }
  });

  it("supports legacy CHAIN_RESPONSE sourceCardId alias", () => {
    let state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: ["target_from_trap1"],
      }],
      currentPriorityPlayer: "host",
    });
    state = setTrapInZone(state, "host", "trap3", "trap3");

    const events = decide(state, {
      type: "CHAIN_RESPONSE",
      pass: false,
      sourceCardId: "trap3",
      effectIndex: 1,
    }, "host");

    const chainLink = events.find((event) => event.type === "CHAIN_LINK_ADDED");
    expect(chainLink).toBeDefined();
    if (chainLink?.type === "CHAIN_LINK_ADDED") {
      expect(chainLink.cardId).toBe("trap3");
    }
  });

  it("supports CHAIN_RESPONSE chainLink alias as effect selection", () => {
    let state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: ["target_from_trap1"],
      }],
      currentPriorityPlayer: "host",
    });
    state = setTrapInZone(state, "host", "trap3", "trap3");

    const events = decide(state, {
      type: "CHAIN_RESPONSE",
      cardId: "trap3",
      pass: false,
      chainLink: 1,
    }, "host");

    const chainLink = events.find((event) => event.type === "CHAIN_LINK_ADDED");
    expect(chainLink).toBeDefined();
    if (chainLink?.type === "CHAIN_LINK_ADDED") {
      expect(chainLink.effectIndex).toBe(1);
    }
  });

  it("legalMoves only exposes chain responses to the current chain responder", () => {
    let state = makeState({
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: [],
      }],
      currentPriorityPlayer: "host",
    });
    state = setTrapInZone(state, "host", "trap1", "trap1");

    const hostMoves = legalMoves(state, "host");
    const awayMoves = legalMoves(state, "away");

    expect(hostMoves.some((move) => move.type === "CHAIN_RESPONSE")).toBe(true);
    expect(awayMoves.some((move) => move.type === "CHAIN_RESPONSE")).toBe(false);
  });

  it("decide only accepts CHAIN_RESPONSE from the active chain responder", () => {
    const state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: ["target1"],
      }],
      currentPriorityPlayer: "host",
    });

    const events = decide(state, { type: "CHAIN_RESPONSE", pass: true }, "away");

    expect(events).toEqual([]);
  });

  it("evolve CHAIN_LINK_ADDED adds to currentChain and switches priority", () => {
    let state = makeState();
    state = evolve(state, [{
      type: "CHAIN_LINK_ADDED",
      cardId: "trap1",
      seat: "host",
      effectIndex: 0,
    }]);
    expect(state.currentChain.length).toBe(1);
    expect(state.currentChain[0].cardId).toBe("trap1");
    expect(state.currentPriorityPlayer).toBe("away");
  });

  it("evolve CHAIN_RESOLVED clears chain", () => {
    let state = makeState({
      currentChain: [{ cardId: "trap1", effectIndex: 0, activatingPlayer: "host", targets: [] }],
      currentPriorityPlayer: "away",
    });
    state = evolve(state, [{ type: "CHAIN_RESOLVED" }]);
    expect(state.currentChain).toEqual([]);
    expect(state.currentPriorityPlayer).toBeNull();
  });

  it("evolve CHAIN_STARTED initializes empty chain", () => {
    let state = makeState();
    state = evolve(state, [{ type: "CHAIN_STARTED" }]);
    expect(state.currentChain).toEqual([]);
  });

  it("chain resolves LIFO — last link resolves first", () => {
    const state = makeState({
      currentPhase: "main",
      currentPriorityPlayer: "host",
      currentChain: [
        { cardId: "trap1", effectIndex: 0, activatingPlayer: "host", targets: ["target_from_trap1"] },
        { cardId: "trap2", effectIndex: 0, activatingPlayer: "away", targets: [] },
      ],
      currentChainPasser: "away",
    });
    const events = decide(state, { type: "CHAIN_RESPONSE", pass: true }, "host");

    // Should resolve chain
    expect(events.some(e => e.type === "CHAIN_RESOLVED")).toBe(true);

    // trap2 effects should come before trap1 effects (LIFO)
    const chainResolvedIdx = events.findIndex(e => e.type === "CHAIN_RESOLVED");
    const afterResolve = events.slice(chainResolvedIdx + 1);

    // trap2 = damage: 500, trap1 = destroy: target
    // So DAMAGE_DEALT should come before CARD_DESTROYED
    const damageIdx = afterResolve.findIndex(e => e.type === "DAMAGE_DEALT");
    const destroyIdx = afterResolve.findIndex(e => e.type === "CARD_DESTROYED");
    if (damageIdx > -1 && destroyIdx > -1) {
      expect(damageIdx).toBeLessThan(destroyIdx);
    }
  });

  it("CHAIN_RESPONSE with invalid effect index yields no events", () => {
    let state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: ["target_from_trap1"],
      }],
      currentPriorityPlayer: "host",
    });
    state = setTrapInZone(state, "host", "trap3", "trap3");

    const events = decide(state, {
        type: "CHAIN_RESPONSE",
        cardId: "trap3",
        pass: false,
        effectIndex: 2,
      },
      "host");
    expect(events).toEqual([]);
  });

  it("CHAIN_RESPONSE returns empty events for invalid cardId", () => {
    const state = makeState({ currentPhase: "main" });
    const events = decide(state, { type: "CHAIN_RESPONSE", cardId: "nonexistent", pass: false }, "host");
    expect(events).toEqual([]);
  });

  it("CHAIN_RESPONSE returns empty events when card not in spell/trap zone", () => {
    let state = makeState({ currentPhase: "main" });
    // Add card to hand instead of spell/trap zone
    state = { ...state, hostHand: [...state.hostHand, "trap1"] };

    const events = decide(state, { type: "CHAIN_RESPONSE", cardId: "trap1", pass: false }, "host");
    expect(events).toEqual([]);
  });

  it("evolve CHAIN_PASSED records chain passer and switches priority", () => {
    const state = makeState({
      currentPhase: "main",
      currentChain: [{ cardId: "trap1", effectIndex: 0, activatingPlayer: "host", targets: ["t"] }],
      currentPriorityPlayer: "host",
    });
    const stateAfter = evolve(state, [{ type: "CHAIN_PASSED", seat: "host" }]);

    expect(stateAfter.currentChain).toEqual(state.currentChain);
    expect(stateAfter.currentChainPasser).toBe("host");
    expect(stateAfter.currentPriorityPlayer).toBe("away");
  });
});
