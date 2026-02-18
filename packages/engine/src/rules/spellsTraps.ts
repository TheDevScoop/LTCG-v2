import type { GameState, Seat, Command, EngineEvent, SpellTrapCard } from "../types/index.js";
import { executeEffect } from "../effects/interpreter.js";
import { expectDefined } from "../internal/invariant.js";

function getPlayerZones(state: GameState, seat: Seat) {
  const isHost = seat === "host";
  return {
    hand: isHost ? state.hostHand : state.awayHand,
    spellTrapZone: isHost ? state.hostSpellTrapZone : state.awaySpellTrapZone,
    fieldSpell: isHost ? state.hostFieldSpell : state.awayFieldSpell,
    graveyard: isHost ? state.hostGraveyard : state.awayGraveyard,
  };
}

export function decideSetSpellTrap(
  state: GameState,
  seat: Seat,
  command: Extract<Command, { type: "SET_SPELL_TRAP" }>
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const { cardId } = command;

  // Check phase
  if (state.currentPhase !== "main" && state.currentPhase !== "main2") {
    return events;
  }

  // Check if card is in hand
  const zones = getPlayerZones(state, seat);
  if (!zones.hand.includes(cardId)) {
    return events;
  }

  // Get card definition
  const card = state.cardLookup[cardId];
  if (!card || (card.type !== "spell" && card.type !== "trap")) {
    return events;
  }

  // Check spell/trap zone space
  if (zones.spellTrapZone.length >= state.config.maxSpellTrapSlots) {
    return events;
  }

  // Emit SPELL_TRAP_SET event
  events.push({
    type: "SPELL_TRAP_SET",
    seat,
    cardId,
  });

  return events;
}

export function decideActivateSpell(
  state: GameState,
  seat: Seat,
  command: Extract<Command, { type: "ACTIVATE_SPELL" }>
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const { cardId, effectIndex, targets = [] } = command;

  // Check phase (for now, only main phases)
  if (state.currentPhase !== "main" && state.currentPhase !== "main2") {
    return events;
  }

  const zones = getPlayerZones(state, seat);

  // Check if card is in hand or face-down in spell/trap zone
  const inHand = zones.hand.includes(cardId);
  const setCard = zones.spellTrapZone.find((c) => c.cardId === cardId);

  if (!inHand && !setCard) {
    return events;
  }

  // Get card definition - use definitionId if it's a set card, otherwise use cardId
  const definitionId = setCard ? setCard.definitionId : cardId;
  const card = state.cardLookup[definitionId];
  if (!card || card.type !== "spell") {
    return events;
  }

  // If activating from hand, check if spell/trap zone has space (unless it's a field spell)
  if (inHand && card.spellType !== "field") {
    if (zones.spellTrapZone.length >= state.config.maxSpellTrapSlots) {
      return events;
    }
  }

  // If it's a field spell and replacing an existing one, send old one to graveyard
  if (card.spellType === "field" && zones.fieldSpell !== null) {
    events.push({
      type: "CARD_SENT_TO_GRAVEYARD",
      cardId: zones.fieldSpell.cardId,
      from: "field",
      sourceSeat: seat,
    });
  }

  // Emit SPELL_ACTIVATED event
  events.push({
    type: "SPELL_ACTIVATED",
    seat,
    cardId,
    targets,
  });

  // Execute spell effect (if card has effects, execute the first one)
  if (card.effects && card.effects.length > 0) {
    const selectedEffectIndex = effectIndex ?? 0;
    if (selectedEffectIndex >= 0 && selectedEffectIndex < card.effects.length) {
      events.push(...executeEffect(state, card, selectedEffectIndex, seat, cardId, targets));
    }
  }

  return events;
}

export function decideActivateTrap(
  state: GameState,
  seat: Seat,
  command: Extract<Command, { type: "ACTIVATE_TRAP" }>
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const { cardId, effectIndex, targets = [] } = command;

  const zones = getPlayerZones(state, seat);

  // Card must be face-down in spell/trap zone
  const setCard = zones.spellTrapZone.find((c) => c.cardId === cardId);
  if (!setCard || !setCard.faceDown) {
    return events;
  }

  // Get card definition
  const card = state.cardLookup[setCard.definitionId];
  if (!card || card.type !== "trap") {
    return events;
  }

  // Emit CHAIN_STARTED for the first chainable activation.
  // The trap effect resolves later when the chain resolves.
  const selectedEffectIndex =
    Number.isInteger(effectIndex) && typeof effectIndex === "number" && effectIndex >= 0
      ? effectIndex
      : 0;
  const resolvedEffectIndex =
    Array.isArray(card.effects) && selectedEffectIndex < card.effects.length
      ? selectedEffectIndex
      : 0;

  events.push({ type: "CHAIN_STARTED" });
  events.push({
    type: "CHAIN_LINK_ADDED",
    cardId,
    seat,
    effectIndex: resolvedEffectIndex,
    targets,
  });

  // Mark trap as activated so zone state updates immediately.
  events.push({
    type: "TRAP_ACTIVATED",
    seat,
    cardId,
    targets,
  });

  return events;
}

export function evolveSpellTrap(state: GameState, event: EngineEvent): GameState {
  const newState = { ...state };

  switch (event.type) {
    case "SPELL_TRAP_SET": {
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

      // Add to spell/trap zone
      const spellTrapZone = isHost ? [...newState.hostSpellTrapZone] : [...newState.awaySpellTrapZone];
      const newCard: SpellTrapCard = {
        cardId,
        definitionId: cardId,
        faceDown: true,
        activated: false,
      };
      spellTrapZone.push(newCard);

      if (isHost) {
        newState.hostSpellTrapZone = spellTrapZone;
      } else {
        newState.awaySpellTrapZone = spellTrapZone;
      }
      break;
    }

    case "SPELL_ACTIVATED": {
      const { seat, cardId } = event;
      const isHost = seat === "host";

      const hand = isHost ? [...newState.hostHand] : [...newState.awayHand];
      const spellTrapZone = isHost ? [...newState.hostSpellTrapZone] : [...newState.awaySpellTrapZone];
      const graveyard = isHost ? [...newState.hostGraveyard] : [...newState.awayGraveyard];

      const inHand = hand.includes(cardId);
      const setCardIndex = spellTrapZone.findIndex((c) => c.cardId === cardId);
      const setCard = setCardIndex > -1 ? spellTrapZone[setCardIndex] : null;

      // Get card definition - use definitionId if it's a set card, otherwise use cardId
      const definitionId = setCard ? setCard.definitionId : cardId;
      const card = expectDefined(
        newState.cardLookup[definitionId],
        `rules.spellsTraps.evolveSpellTrap missing definition ${definitionId} for SPELL_ACTIVATED ${cardId}`
      );

      // If it's a field spell
      if (card.spellType === "field") {
        // Remove from hand or spell/trap zone
        if (inHand) {
          const handIndex = hand.indexOf(cardId);
          if (handIndex > -1) {
            hand.splice(handIndex, 1);
          }
        } else if (setCardIndex > -1) {
          spellTrapZone.splice(setCardIndex, 1);
        }

        // Set as field spell (face-up)
        const fieldCard: SpellTrapCard = {
          cardId,
          definitionId: cardId,
          faceDown: false,
          activated: true,
          isFieldSpell: true,
        };

        if (isHost) {
          newState.hostFieldSpell = fieldCard;
        } else {
          newState.awayFieldSpell = fieldCard;
        }
      }
      // If it's a continuous spell
      else if (card.spellType === "continuous") {
        // If from hand, add to spell/trap zone face-up
        if (inHand) {
          const handIndex = hand.indexOf(cardId);
          if (handIndex > -1) {
            hand.splice(handIndex, 1);
          }

          const continuousCard: SpellTrapCard = {
            cardId,
            definitionId: cardId,
            faceDown: false,
            activated: true,
          };
          spellTrapZone.push(continuousCard);
        }
        // If face-down, flip it face-up
        else if (setCardIndex > -1) {
          const setCardInZone = expectDefined(
            spellTrapZone[setCardIndex],
            `rules.spellsTraps.evolveSpellTrap missing set card at index ${setCardIndex}`
          );

          spellTrapZone[setCardIndex] = {
            ...setCardInZone,
            faceDown: false,
            activated: true,
          };
        }
      }
      // Normal spell (and other types): go to graveyard
      else {
        // Remove from hand or spell/trap zone
        if (inHand) {
          const handIndex = hand.indexOf(cardId);
          if (handIndex > -1) {
            hand.splice(handIndex, 1);
          }
        } else if (setCardIndex > -1) {
          spellTrapZone.splice(setCardIndex, 1);
        }

        // Add to graveyard
        graveyard.push(cardId);
      }

      if (isHost) {
        newState.hostHand = hand;
        newState.hostSpellTrapZone = spellTrapZone;
        newState.hostGraveyard = graveyard;
      } else {
        newState.awayHand = hand;
        newState.awaySpellTrapZone = spellTrapZone;
        newState.awayGraveyard = graveyard;
      }
      break;
    }

    case "TRAP_ACTIVATED": {
      const { seat, cardId } = event;
      const isHost = seat === "host";

      const spellTrapZone = isHost ? [...newState.hostSpellTrapZone] : [...newState.awaySpellTrapZone];
      const graveyard = isHost ? [...newState.hostGraveyard] : [...newState.awayGraveyard];

      const setCardIndex = spellTrapZone.findIndex((c) => c.cardId === cardId);
      if (setCardIndex > -1) {
        const setCard = expectDefined(
          spellTrapZone[setCardIndex],
          `rules.spellsTraps.evolveSpellTrap missing trap card at index ${setCardIndex}`
        );
        const card = expectDefined(
          newState.cardLookup[setCard.definitionId],
          `rules.spellsTraps.evolveSpellTrap missing definition ${setCard.definitionId} for TRAP_ACTIVATED ${cardId}`
        );
        const setCardInZone = expectDefined(
          spellTrapZone[setCardIndex],
          `rules.spellsTraps.evolveSpellTrap missing trap zone entry at index ${setCardIndex}`
        );

        // Continuous trap: flip face-up and stay on field
        if (card.trapType === "continuous") {
          spellTrapZone[setCardIndex] = {
            ...setCardInZone,
            faceDown: false,
            activated: true,
          };
        }
        // Normal trap (and counter): go to graveyard
        else {
          spellTrapZone.splice(setCardIndex, 1);
          graveyard.push(cardId);
        }
      }

      if (isHost) {
        newState.hostSpellTrapZone = spellTrapZone;
        newState.hostGraveyard = graveyard;
      } else {
        newState.awaySpellTrapZone = spellTrapZone;
        newState.awayGraveyard = graveyard;
      }
      break;
    }

    case "CARD_SENT_TO_GRAVEYARD": {
      const { cardId, from, sourceSeat } = event;

      // Handle field spell replacement
      if (from === "field") {
        if (sourceSeat === "host") {
          if (newState.hostFieldSpell?.cardId === cardId) {
            newState.hostFieldSpell = null;
            newState.hostGraveyard = [...newState.hostGraveyard, cardId];
          }
        } else if (sourceSeat === "away") {
          if (newState.awayFieldSpell?.cardId === cardId) {
            newState.awayFieldSpell = null;
            newState.awayGraveyard = [...newState.awayGraveyard, cardId];
          }
        } else if (newState.hostFieldSpell?.cardId === cardId) {
          newState.hostFieldSpell = null;
          newState.hostGraveyard = [...newState.hostGraveyard, cardId];
        } else if (newState.awayFieldSpell?.cardId === cardId) {
          newState.awayFieldSpell = null;
          newState.awayGraveyard = [...newState.awayGraveyard, cardId];
        }
      }
      // Handle spell/trap zone cards
      else if (from === "spellTrapZone" || from === "spell_trap_zone") {
        const removeFromSpellTrapZone = (seat: Seat) => {
          if (seat === "host") {
            const index = newState.hostSpellTrapZone.findIndex((c) => c.cardId === cardId);
            if (index < 0) return false;
            newState.hostSpellTrapZone = [...newState.hostSpellTrapZone];
            newState.hostSpellTrapZone.splice(index, 1);
            newState.hostGraveyard = [...newState.hostGraveyard, cardId];
            return true;
          }

          const index = newState.awaySpellTrapZone.findIndex((c) => c.cardId === cardId);
          if (index < 0) return false;
          newState.awaySpellTrapZone = [...newState.awaySpellTrapZone];
          newState.awaySpellTrapZone.splice(index, 1);
          newState.awayGraveyard = [...newState.awayGraveyard, cardId];
          return true;
        };

        if (sourceSeat) {
          removeFromSpellTrapZone(sourceSeat);
        } else if (!removeFromSpellTrapZone("host")) {
          removeFromSpellTrapZone("away");
        }
      }
      break;
    }
  }

  return newState;
}
