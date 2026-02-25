import { describe, expect, it } from "vitest";
import { createInitialState, decide, evolve, legalMoves } from "../engine.js";
import { defineCards } from "../cards.js";
import { DEFAULT_CONFIG } from "../types/config.js";
import type { BoardCard, EngineEvent } from "../types/index.js";

const cardLookup = defineCards([
  {
    id: "m1",
    name: "Test Monster",
    type: "stereotype",
    description: "Baseline attacker",
    rarity: "common",
    level: 4,
    attack: 1200,
    defense: 1000,
  },
]);

function createDeck(size = 40): string[] {
  return Array.from({ length: size }, () => "m1");
}

function createState() {
  return createInitialState(
    cardLookup,
    DEFAULT_CONFIG,
    "host",
    "away",
    createDeck(),
    createDeck(),
    "host",
    () => 0.5,
  );
}

function createBoardCard(cardId: string): BoardCard {
  return {
    cardId,
    definitionId: "m1",
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
}

describe("rule overlays", () => {
  it("disable_attacks blocks attack legal moves and attack commands", () => {
    const base = createState();
    const attackerId = base.hostHand[0]!;
    const setup = {
      ...base,
      currentPhase: "combat" as const,
      turnNumber: 2,
      hostHand: base.hostHand.slice(1),
      hostBoard: [createBoardCard(attackerId)],
    };

    const restricted = evolve(
      setup,
      [{
        type: "TURN_RESTRICTION_APPLIED",
        seat: "host",
        restriction: "disable_attacks",
        sourceCardId: "src",
        durationTurns: 1,
      }],
      { skipDerivedChecks: true },
    );

    const moves = legalMoves(restricted, "host");
    expect(moves.some((move) => move.type === "DECLARE_ATTACK")).toBe(false);

    const events = decide(restricted, { type: "DECLARE_ATTACK", attackerId }, "host");
    expect(events).toEqual([]);
  });

  it("disable_draw_phase prevents draw on draw->standby transition", () => {
    const base = createState();
    const restricted = evolve(
      base,
      [{
        type: "TURN_RESTRICTION_APPLIED",
        seat: "host",
        restriction: "disable_draw_phase",
        sourceCardId: "src",
        durationTurns: 1,
      }],
      { skipDerivedChecks: true },
    );

    const events = decide(restricted, { type: "ADVANCE_PHASE" }, "host");
    expect(events.some((event) => event.type === "CARD_DRAWN")).toBe(false);
    expect(events).toContainEqual({ type: "PHASE_CHANGED", from: "draw", to: "standby" });
  });

  it("disable_battle_phase skips combat phase transition", () => {
    const base = createState();
    const setup = { ...base, currentPhase: "main" as const };
    const restricted = evolve(
      setup,
      [{
        type: "TURN_RESTRICTION_APPLIED",
        seat: "host",
        restriction: "disable_battle_phase",
        sourceCardId: "src",
        durationTurns: 1,
      }],
      { skipDerivedChecks: true },
    );

    const events = decide(restricted, { type: "ADVANCE_PHASE" }, "host");
    expect(events).toContainEqual({ type: "PHASE_CHANGED", from: "main", to: "main2" });
    expect(events.some((event) => event.type === "PHASE_CHANGED" && event.to === "combat")).toBe(false);
  });

  it("top-deck view + rearrange events update state deterministically", () => {
    const base = createState();
    const topThree = base.hostDeck.slice(0, 3);
    const reversed = [...topThree].reverse();

    const viewed = evolve(
      base,
      [{
        type: "TOP_CARDS_VIEWED",
        seat: "host",
        cardIds: topThree,
        sourceCardId: "src",
      }],
      { skipDerivedChecks: true },
    );

    expect(viewed.topDeckView?.host?.cardIds).toEqual(topThree);

    const rearrangedEvents: EngineEvent[] = [{
      type: "TOP_CARDS_REARRANGED",
      seat: "host",
      cardIds: reversed,
      sourceCardId: "src",
    }];
    const rearranged = evolve(viewed, rearrangedEvents, { skipDerivedChecks: true });

    expect(rearranged.hostDeck.slice(0, 3)).toEqual(reversed);
    expect(rearranged.topDeckView?.host?.cardIds).toEqual(reversed);
  });
});
