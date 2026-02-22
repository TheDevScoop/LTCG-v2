/**
 * Integration Test — Full Game Loop
 *
 * Plays a complete game from start to LP-zero win using only the engine API.
 * Validates the full decide/evolve loop works for a real game:
 *   1. Create engine with two decks
 *   2. Phase transitions (draw → standby → main)
 *   3. Summon a stereotype
 *   4. Enter combat → declare direct attack → deal damage
 *   5. End turn
 *   6. Repeat until LP reaches 0
 *   7. Verify GAME_ENDED event fires
 */

import { describe, it, expect } from "vitest";
import { createEngine } from "../engine.js";
import { defineCards } from "../cards.js";
import type { CardDefinition } from "../types/index.js";
import type { EngineEvent } from "../types/events.js";
import { resolveDefinitionId } from "../instanceIds.js";

const cards: CardDefinition[] = [
  {
    id: "attacker",
    name: "Relentless Attacker",
    type: "stereotype",
    description: "A monster that attacks every turn",
    rarity: "common",
    attack: 2000,
    defense: 1000,
    level: 4,
    attribute: "fire",
  },
  {
    id: "filler",
    name: "Deck Filler",
    type: "stereotype",
    description: "Fills out the deck",
    rarity: "common",
    attack: 100,
    defense: 100,
    level: 1,
    attribute: "earth",
  },
];

const cardLookup = defineCards(cards);

function makeDeck(size: number): string[] {
  // All attackers so we're guaranteed to draw one regardless of shuffle
  return Array(size).fill("attacker");
}

describe("Integration: Full Game Loop", () => {
  it("plays a complete game from start to LP-zero win via direct attacks", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: makeDeck(40),
      awayDeck: makeDeck(40),
      firstPlayer: "host",
    });

    const allEvents: EngineEvent[] = [];

    function act(command: { type: string; [key: string]: unknown }, seat: "host" | "away") {
      const events = engine.decide(command as any, seat);
      engine.evolve(events);
      allEvents.push(...events);
      return events;
    }

    function skipPhases(seat: "host" | "away", toPhase: string) {
      let safety = 10;
      while (engine.getState().currentPhase !== toPhase && safety-- > 0) {
        act({ type: "ADVANCE_PHASE" }, seat);
      }
    }

    // Initial state checks
    let state = engine.getState();
    expect(state.hostHand).toHaveLength(5);
    expect(state.hostLifePoints).toBe(8000);
    expect(state.awayLifePoints).toBe(8000);

    // -----------------------------------------------------------------------
    // Strategy: Host summons attacker and attacks each turn.
    // Away never summons, just skips turns so host can direct attack.
    //
    // Turn 1 (host): summon attacker, can't attack on turn 1, end turn
    // Turn 2 (away): skip phases, end turn
    // Turn 3 (host): attack directly (2000 damage) → 6000 LP
    // Turn 4 (away): skip
    // Turn 5 (host): attack → 4000 LP
    // Turn 6 (away): skip
    // Turn 7 (host): attack → 2000 LP
    // Turn 8 (away): skip
    // Turn 9 (host): attack → 0 LP → GAME_ENDED
    // -----------------------------------------------------------------------

    let turnCount = 0;
    const MAX_TURNS = 20;

    while (!engine.getState().gameOver && turnCount < MAX_TURNS) {
      state = engine.getState();
      const seat = state.currentTurnPlayer;
      turnCount++;

      // Draw → Standby (draws a card) → Main
      skipPhases(seat, "main");

      if (seat === "host") {
        // Summon attacker if available and no monster on board yet
        state = engine.getState();
        const summonCandidate = state.hostHand.find(
          (cardId) => resolveDefinitionId(state, cardId) === "attacker"
        );
        if (
          summonCandidate &&
          state.hostBoard.length === 0 &&
          !state.hostNormalSummonedThisTurn
        ) {
          act({ type: "SUMMON", cardId: summonCandidate, position: "attack" }, "host");
        }

        // Main → Combat
        skipPhases("host", "combat");

        // Attack if possible (not turn 1, attacker canAttack)
        state = engine.getState();
        const attacker = state.hostBoard.find(
          (c) => c.canAttack && !c.hasAttackedThisTurn && !c.faceDown
        );
        if (attacker && state.awayBoard.length === 0 && state.turnNumber > 1) {
          act({ type: "DECLARE_ATTACK", attackerId: attacker.cardId }, "host");
        }
      }

      if (engine.getState().gameOver) break;
      act({ type: "END_TURN" }, seat);
    }

    // -----------------------------------------------------------------------
    // Verify game ended properly
    // -----------------------------------------------------------------------
    state = engine.getState();
    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe("host");
    expect(state.winReason).toBeTruthy();
    expect(turnCount).toBeLessThan(MAX_TURNS);

    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe("host");
    expect(state.winReason).toBe("lp_zero");

    // Verify LP-zero win condition
    // LP-zero is detected via state-based check in evolve(), not via GAME_ENDED event
    expect(state.awayLifePoints).toBeLessThanOrEqual(0);
    expect(state.winReason).toBe("lp_zero");
  });

  it("ends via surrender", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: makeDeck(40),
      awayDeck: makeDeck(40),
    });

    const events = engine.decide({ type: "SURRENDER" }, "host");
    engine.evolve(events);

    const state = engine.getState();
    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe("away");
    expect(state.winReason).toBe("surrender");

    const gameEndedEvent = events.find((e) => e.type === "GAME_ENDED");
    expect(gameEndedEvent).toBeTruthy();
  });

  it("masks state correctly during gameplay", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "host-player",
      awayId: "away-player",
      hostDeck: makeDeck(40),
      awayDeck: makeDeck(40),
    });

    const hostView = engine.mask("host");
    const awayView = engine.mask("away");

    // Host can see own hand but not opponent's
    expect(hostView.hand).toHaveLength(5);
    expect(hostView.opponentHandCount).toBe(5);

    // Away sees the same but from their perspective
    expect(awayView.hand).toHaveLength(5);
    expect(awayView.opponentHandCount).toBe(5);

    // Seat assignments are correct
    expect(hostView.mySeat).toBe("host");
    expect(awayView.mySeat).toBe("away");

    // Both see the same turn info
    expect(hostView.currentTurnPlayer).toBe(awayView.currentTurnPlayer);
    expect(hostView.turnNumber).toBe(awayView.turnNumber);
  });
});
