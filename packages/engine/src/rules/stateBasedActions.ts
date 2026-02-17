import type { GameState, EngineEvent, Seat } from "../types/index.js";

export function checkStateBasedActions(state: GameState): EngineEvent[] {
  const events: EngineEvent[] = [];

  // 1. LP win condition — if either player's LP <= 0, game ends
  if (state.hostLifePoints <= 0) {
    events.push({
      type: "GAME_ENDED",
      winner: "away",
      reason: "lp_zero",
    });
    return events; // Game is over, no need to check other conditions
  }

  if (state.awayLifePoints <= 0) {
    events.push({
      type: "GAME_ENDED",
      winner: "host",
      reason: "lp_zero",
    });
    return events;
  }

  // 2. Deck-out condition — if current turn player has empty deck during draw phase, they lose
  if (state.currentPhase === "draw") {
    const currentPlayerDeck = state.currentTurnPlayer === "host" ? state.hostDeck : state.awayDeck;
    if (currentPlayerDeck.length === 0) {
      events.push({
        type: "DECK_OUT",
        seat: state.currentTurnPlayer,
      });
      return events; // DECK_OUT event will trigger game end
    }
  }

  // 3. Breakdown win condition — if either player has caused >= maxBreakdownsToWin breakdowns
  if (state.hostBreakdownsCaused >= state.config.maxBreakdownsToWin) {
    events.push({
      type: "GAME_ENDED",
      winner: "host",
      reason: "breakdown",
    });
    return events;
  }

  if (state.awayBreakdownsCaused >= state.config.maxBreakdownsToWin) {
    events.push({
      type: "GAME_ENDED",
      winner: "away",
      reason: "breakdown",
    });
    return events;
  }

  // 4. Hand size limit — if it's end phase and current player has > maxHandSize cards,
  //    discard excess (just emit CARD_SENT_TO_GRAVEYARD for last cards in hand)
  if (state.currentPhase === "end") {
    const currentPlayerHand = state.currentTurnPlayer === "host" ? state.hostHand : state.awayHand;
    const excess = currentPlayerHand.length - state.config.maxHandSize;

    if (excess > 0) {
      // Discard the last cards in hand
      const cardsToDiscard = currentPlayerHand.slice(-excess);
      for (const cardId of cardsToDiscard) {
        events.push({
          type: "CARD_SENT_TO_GRAVEYARD",
          cardId,
          from: "hand",
        });
      }
    }
  }

  return events;
}

export function drawCard(state: GameState, seat: Seat): EngineEvent[] {
  const events: EngineEvent[] = [];
  const deck = seat === "host" ? state.hostDeck : state.awayDeck;

  // If deck is empty, emit DECK_OUT event
  if (deck.length === 0) {
    events.push({
      type: "DECK_OUT",
      seat,
    });
    return events;
  }

  // Draw top card from deck
  const cardId = deck[0];
  if (!cardId) return events;
  events.push({
    type: "CARD_DRAWN",
    seat,
    cardId,
  });

  return events;
}
