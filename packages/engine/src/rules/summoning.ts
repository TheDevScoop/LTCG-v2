import type { GameState, Seat, Command, EngineEvent, BoardCard } from "../types/index.js";
import { expectDefined } from "../internal/invariant.js";
import { getCardDefinition, resolveDefinitionId } from "../instanceIds.js";

export function decideSummon(
  state: GameState,
  seat: Seat,
  command: Extract<Command, { type: "SUMMON" }>
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const { cardId, position, tributeCardIds = [] } = command;

  // Check phase
  if (state.currentPhase !== "main" && state.currentPhase !== "main2") {
    return events;
  }

  // Check if card is in hand
  const hand = seat === "host" ? state.hostHand : state.awayHand;
  if (!hand.includes(cardId)) {
    return events;
  }

  // Get card definition
  const card = getCardDefinition(state, cardId);
  if (!card || card.type !== "stereotype") {
    return events;
  }

  // Check normal summon limit
  const alreadySummoned = seat === "host" ? state.hostNormalSummonedThisTurn : state.awayNormalSummonedThisTurn;
  if (alreadySummoned) {
    return events;
  }

  const board = seat === "host" ? state.hostBoard : state.awayBoard;

  // Check tribute requirements
  const level = card.level ?? 0;
  if (level >= 7) {
    // Requires 1 tribute
    if (tributeCardIds.length !== 1) {
      return events;
    }
    const tributeCardId = tributeCardIds[0];
    if (!tributeCardId) return events;

    // Validate tribute is a valid monster on player's board
    const tributeCard = board.find((c) => c.cardId === tributeCardId);
    if (!tributeCard || tributeCard.faceDown) {
      return events;
    }

    // Board space check: a tribute frees one slot, so a full board can still summon.
    // Disallow impossible overflow states.
    const boardAfterTributeCount = board.length - 1;
    if (boardAfterTributeCount >= state.config.maxBoardSlots) {
      return events;
    }

    // Send tribute to graveyard
    events.push({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: tributeCardId,
      from: "board",
      sourceSeat: seat,
    });
  } else {
    // Level 1-6: no tribute needed
    if (tributeCardIds.length > 0) {
      return events;
    }
    if (board.length >= state.config.maxBoardSlots) {
      return events;
    }
  }

  // Emit MONSTER_SUMMONED event
  events.push({
    type: "MONSTER_SUMMONED",
    seat,
    cardId,
    position,
    tributes: tributeCardIds,
  });

  return events;
}

export function decideSetMonster(
  state: GameState,
  seat: Seat,
  command: Extract<Command, { type: "SET_MONSTER" }>
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const { cardId } = command;

  // Check phase
  if (state.currentPhase !== "main" && state.currentPhase !== "main2") {
    return events;
  }

  // Check if card is in hand
  const hand = seat === "host" ? state.hostHand : state.awayHand;
  if (!hand.includes(cardId)) {
    return events;
  }

  // Get card definition
  const card = getCardDefinition(state, cardId);
  if (!card || card.type !== "stereotype") {
    return events;
  }

  // Check normal summon limit
  const alreadySummoned = seat === "host" ? state.hostNormalSummonedThisTurn : state.awayNormalSummonedThisTurn;
  if (alreadySummoned) {
    return events;
  }

  // Check board space
  const board = seat === "host" ? state.hostBoard : state.awayBoard;
  if (board.length >= state.config.maxBoardSlots) {
    return events;
  }

  // Emit MONSTER_SET event
  events.push({
    type: "MONSTER_SET",
    seat,
    cardId,
  });

  return events;
}

export function decideFlipSummon(
  state: GameState,
  seat: Seat,
  command: Extract<Command, { type: "FLIP_SUMMON" }>
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const { cardId } = command;

  // Check phase
  if (state.currentPhase !== "main" && state.currentPhase !== "main2") {
    return events;
  }

  // Check if card is face-down on player's board
  const board = seat === "host" ? state.hostBoard : state.awayBoard;
  const card = board.find((c) => c.cardId === cardId);
  if (!card || !card.faceDown) {
    return events;
  }

  // Cannot flip summon a card that was set this turn
  if (card.turnSummoned >= state.turnNumber) {
    return events;
  }

  // Emit FLIP_SUMMONED event (default to attack position)
  events.push({
    type: "FLIP_SUMMONED",
    seat,
    cardId,
    position: "attack",
  });

  return events;
}

export function evolveSummon(state: GameState, event: EngineEvent): GameState {
  const newState = { ...state };

  switch (event.type) {
    case "MONSTER_SUMMONED": {
      const { seat, cardId, position } = event;
      const isHost = seat === "host";

      // Remove from hand
      const hand = isHost ? [...newState.hostHand] : [...newState.awayHand];
      const handIndex = hand.indexOf(cardId);
      if (handIndex > -1) {
        hand.splice(handIndex, 1);
      }
      if (isHost) {
        newState.hostHand = hand;
      } else {
        newState.awayHand = hand;
      }

      const board = isHost ? [...newState.hostBoard] : [...newState.awayBoard];
      // Tribute removal is handled by CARD_SENT_TO_GRAVEYARD events emitted by
      // decideSummon(). Do not remove here to avoid double-removal behavior.

      // Create new BoardCard
      const definitionId = resolveDefinitionId(newState, cardId);
      const newCard: BoardCard = {
        cardId,
        definitionId,
        position,
        faceDown: false,
        canAttack: false,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: newState.turnNumber,
      };
      board.push(newCard);

      if (isHost) {
        newState.hostBoard = board;
        newState.hostNormalSummonedThisTurn = true;
      } else {
        newState.awayBoard = board;
        newState.awayNormalSummonedThisTurn = true;
      }
      break;
    }

    case "MONSTER_SET": {
      const { seat, cardId } = event;
      const isHost = seat === "host";

      // Remove from hand
      const hand = isHost ? [...newState.hostHand] : [...newState.awayHand];
      const handIndex = hand.indexOf(cardId);
      if (handIndex > -1) {
        hand.splice(handIndex, 1);
      }
      if (isHost) {
        newState.hostHand = hand;
      } else {
        newState.awayHand = hand;
      }

      // Create new BoardCard (face-down, defense position)
      const board = isHost ? [...newState.hostBoard] : [...newState.awayBoard];
      const definitionId = resolveDefinitionId(newState, cardId);
      const newCard: BoardCard = {
        cardId,
        definitionId,
        position: "defense",
        faceDown: true,
        canAttack: false,
        hasAttackedThisTurn: false,
        changedPositionThisTurn: false,
        viceCounters: 0,
        temporaryBoosts: { attack: 0, defense: 0 },
        equippedCards: [],
        turnSummoned: newState.turnNumber,
      };
      board.push(newCard);

      if (isHost) {
        newState.hostBoard = board;
        newState.hostNormalSummonedThisTurn = true;
      } else {
        newState.awayBoard = board;
        newState.awayNormalSummonedThisTurn = true;
      }
      break;
    }

    case "FLIP_SUMMONED": {
      const { seat, cardId, position } = event;
      const isHost = seat === "host";

      // Update the card on board
      const board = isHost ? [...newState.hostBoard] : [...newState.awayBoard];
      const cardIndex = board.findIndex((c) => c.cardId === cardId);
      if (cardIndex > -1) {
        const card = expectDefined(
          board[cardIndex],
          `rules.summoning.evolveSummon missing card at index ${cardIndex}`
        );

        board[cardIndex] = {
          ...card,
          faceDown: false,
          position,
          changedPositionThisTurn: true,
        };
      }

      if (isHost) {
        newState.hostBoard = board;
      } else {
        newState.awayBoard = board;
      }
      break;
    }

    case "CARD_SENT_TO_GRAVEYARD": {
      const { cardId, from, sourceSeat } = event;

      const removeFromSeatBoard = (seat: Seat) => {
        if (seat === "host") {
          const idx = newState.hostBoard.findIndex((c) => c.cardId === cardId);
          if (idx > -1) {
            newState.hostBoard = [...newState.hostBoard];
            newState.hostBoard.splice(idx, 1);
            newState.hostGraveyard = [...newState.hostGraveyard, cardId];
            return true;
          }
          return false;
        }

        const idx = newState.awayBoard.findIndex((c) => c.cardId === cardId);
        if (idx > -1) {
          newState.awayBoard = [...newState.awayBoard];
          newState.awayBoard.splice(idx, 1);
          newState.awayGraveyard = [...newState.awayGraveyard, cardId];
          return true;
        }
        return false;
      };

      const removeFromSeatHand = (seat: Seat) => {
        if (seat === "host") {
          const idx = newState.hostHand.indexOf(cardId);
          if (idx > -1) {
            newState.hostHand = [...newState.hostHand];
            newState.hostHand.splice(idx, 1);
            newState.hostGraveyard = [...newState.hostGraveyard, cardId];
            return true;
          }
          return false;
        }

        const idx = newState.awayHand.indexOf(cardId);
        if (idx > -1) {
          newState.awayHand = [...newState.awayHand];
          newState.awayHand.splice(idx, 1);
          newState.awayGraveyard = [...newState.awayGraveyard, cardId];
          return true;
        }
        return false;
      };

      if (from === "board") {
        if (sourceSeat) {
          removeFromSeatBoard(sourceSeat);
        } else if (!removeFromSeatBoard("host")) {
          removeFromSeatBoard("away");
        }
      } else if (from === "hand") {
        if (sourceSeat) {
          removeFromSeatHand(sourceSeat);
        } else if (!removeFromSeatHand("host")) {
          removeFromSeatHand("away");
        }
      }
      break;
    }
  }

  return newState;
}
