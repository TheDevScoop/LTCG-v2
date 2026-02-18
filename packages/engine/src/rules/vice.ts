import type { GameState, EngineEvent } from "../types/index.js";
import { opponentSeat } from "./phases.js";
import { expectDefined } from "../internal/invariant.js";

export function addViceCounters(state: GameState, cardId: string, count: number): EngineEvent[] {
  const events: EngineEvent[] = [];

  // Find the card on either board
  const hostCard = state.hostBoard.find((c) => c.cardId === cardId);
  const awayCard = state.awayBoard.find((c) => c.cardId === cardId);
  const card = hostCard || awayCard;

  if (!card) {
    return events;
  }

  const newCount = Math.max(0, card.viceCounters + count);

  events.push({
    type: "VICE_COUNTER_ADDED",
    cardId,
    newCount,
  });

  return events;
}

export function removeViceCounters(state: GameState, cardId: string, count: number): EngineEvent[] {
  const events: EngineEvent[] = [];

  // Find the card on either board
  const hostCard = state.hostBoard.find((c) => c.cardId === cardId);
  const awayCard = state.awayBoard.find((c) => c.cardId === cardId);
  const card = hostCard || awayCard;

  if (!card) {
    return events;
  }

  const newCount = Math.max(0, card.viceCounters - count);

  events.push({
    type: "VICE_COUNTER_REMOVED",
    cardId,
    newCount,
  });

  return events;
}

export function checkBreakdowns(state: GameState): EngineEvent[] {
  const events: EngineEvent[] = [];

  // Check host board
  for (const card of state.hostBoard) {
    if (card.viceCounters >= state.config.breakdownThreshold) {
      events.push({
        type: "BREAKDOWN_TRIGGERED",
        seat: "host",
        cardId: card.cardId,
      });
      events.push({
        type: "CARD_DESTROYED",
        cardId: card.cardId,
        reason: "breakdown",
      });
      events.push({
        type: "CARD_SENT_TO_GRAVEYARD",
        cardId: card.cardId,
        from: "board",
        sourceSeat: "host",
      });
    }
  }

  // Check away board
  for (const card of state.awayBoard) {
    if (card.viceCounters >= state.config.breakdownThreshold) {
      events.push({
        type: "BREAKDOWN_TRIGGERED",
        seat: "away",
        cardId: card.cardId,
      });
      events.push({
        type: "CARD_DESTROYED",
        cardId: card.cardId,
        reason: "breakdown",
      });
      events.push({
        type: "CARD_SENT_TO_GRAVEYARD",
        cardId: card.cardId,
        from: "board",
        sourceSeat: "away",
      });
    }
  }

  return events;
}

export function evolveVice(state: GameState, event: EngineEvent): GameState {
  const newState = { ...state };

  switch (event.type) {
    case "VICE_COUNTER_ADDED": {
      const { cardId, newCount } = event;

      // Update the card on host board
      const hostIndex = newState.hostBoard.findIndex((c) => c.cardId === cardId);
      if (hostIndex > -1) {
        newState.hostBoard = [...newState.hostBoard];
        const card = expectDefined(
          newState.hostBoard[hostIndex],
          `rules.vice.evolveVice missing host card at index ${hostIndex}`
        );

        newState.hostBoard[hostIndex] = {
          ...card,
          viceCounters: newCount,
        };
      } else {
        // Update the card on away board
        const awayIndex = newState.awayBoard.findIndex((c) => c.cardId === cardId);
        if (awayIndex > -1) {
          newState.awayBoard = [...newState.awayBoard];
          const card = expectDefined(
            newState.awayBoard[awayIndex],
            `rules.vice.evolveVice missing away card at index ${awayIndex}`
          );

          newState.awayBoard[awayIndex] = {
            ...card,
            viceCounters: newCount,
          };
        }
      }
      break;
    }

    case "VICE_COUNTER_REMOVED": {
      const { cardId, newCount } = event;

      // Update the card on host board
      const hostIndex = newState.hostBoard.findIndex((c) => c.cardId === cardId);
      if (hostIndex > -1) {
        newState.hostBoard = [...newState.hostBoard];
        const card = expectDefined(
          newState.hostBoard[hostIndex],
          `rules.vice.evolveVice missing host card at index ${hostIndex}`
        );

        newState.hostBoard[hostIndex] = {
          ...card,
          viceCounters: newCount,
        };
      } else {
        // Update the card on away board
        const awayIndex = newState.awayBoard.findIndex((c) => c.cardId === cardId);
        if (awayIndex > -1) {
          newState.awayBoard = [...newState.awayBoard];
          const card = expectDefined(
            newState.awayBoard[awayIndex],
            `rules.vice.evolveVice missing away card at index ${awayIndex}`
          );

          newState.awayBoard[awayIndex] = {
            ...card,
            viceCounters: newCount,
          };
        }
      }
      break;
    }

    case "BREAKDOWN_TRIGGERED": {
      const { seat } = event;
      const opponent = opponentSeat(seat);

      // Increment breakdown count for the opponent
      if (opponent === "host") {
        newState.hostBreakdownsCaused = newState.hostBreakdownsCaused + 1;

        // Check for win condition
        if (newState.hostBreakdownsCaused >= newState.config.maxBreakdownsToWin) {
          newState.gameOver = true;
          newState.winner = "host";
          newState.winReason = "breakdown";
        }
      } else {
        newState.awayBreakdownsCaused = newState.awayBreakdownsCaused + 1;

        // Check for win condition
        if (newState.awayBreakdownsCaused >= newState.config.maxBreakdownsToWin) {
          newState.gameOver = true;
          newState.winner = "away";
          newState.winReason = "breakdown";
        }
      }
      break;
    }
  }

  return newState;
}
