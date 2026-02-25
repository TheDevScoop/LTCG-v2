import type { GameState, Seat, Command, EngineEvent, SpellTrapCard } from "../types/index.js";
import { executeEffect } from "../effects/interpreter.js";
import { hasValidTargets, validateSelectedTargets } from "./effects.js";
import { expectDefined } from "../internal/invariant.js";
import { getCardDefinition, resolveDefinitionId } from "../instanceIds.js";

function getPlayerZones(state: GameState, seat: Seat) {
  const isHost = seat === "host";
  return {
    hand: isHost ? state.hostHand : state.awayHand,
    board: isHost ? state.hostBoard : state.awayBoard,
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
  const card = getCardDefinition(state, cardId);
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

  const zones = getPlayerZones(state, seat);

  // Check if card is in hand or face-down in spell/trap zone
  const inHand = zones.hand.includes(cardId);
  const setCard = zones.spellTrapZone.find((c) => c.cardId === cardId);

  if (!inHand && !setCard) {
    return events;
  }

  // Get card definition - use definitionId if it's a set card, otherwise use cardId
  const definitionId = setCard ? setCard.definitionId : resolveDefinitionId(state, cardId);
  const card = state.cardLookup[definitionId];
  if (!card || card.type !== "spell") {
    return events;
  }

  // Quick-play spells from hand can only be activated during own main phases.
  // Set quick-play spells follow trap-like timing (handled in chain window / opponent turn).
  if (card.spellType === "quick-play" && inHand) {
    if (state.currentPhase !== "main" && state.currentPhase !== "main2") {
      return events;
    }
  } else if (card.spellType !== "quick-play") {
    // Non-quick-play spells: only main phases
    if (state.currentPhase !== "main" && state.currentPhase !== "main2") {
      return events;
    }
  }

  // If activating from hand, check if spell/trap zone has space (unless it's a field spell)
  if (inHand && card.spellType !== "field") {
    if (zones.spellTrapZone.length >= state.config.maxSpellTrapSlots) {
      return events;
    }
  }

  // ── Equip spell: require a face-up monster on own board as target ──
  if (card.spellType === "equip") {
    const faceUpMonsters = zones.board.filter((c) => !c.faceDown);
    if (faceUpMonsters.length === 0) {
      return events; // No valid targets
    }

    // If targets are provided, validate the target is a face-up monster on own board
    if (targets.length > 0) {
      const targetCardId = targets[0];
      const targetOnBoard = faceUpMonsters.find((c) => c.cardId === targetCardId);
      if (!targetOnBoard) return events;
    } else {
      // No target specified - block activation (equips require a target)
      return events;
    }
  }

  // ── Ritual spell: validate targets and tributes ──
  if (card.spellType === "ritual") {
    // targets[0] = ritual monster from hand, targets[1..n] = tributes from board
    if (targets.length < 2) return events; // Need at least 1 ritual monster + 1 tribute

    const ritualMonsterId = targets[0];
    if (!ritualMonsterId) return events;
    const tributeIds = targets.slice(1);
    if (new Set(tributeIds).size !== tributeIds.length) return events;

    // Ritual monster must be in hand
    if (!zones.hand.includes(ritualMonsterId)) return events;

    // Ritual monster must be a stereotype (monster) card
    const ritualMonsterDef = getCardDefinition(state, ritualMonsterId);
    if (!ritualMonsterDef || ritualMonsterDef.type !== "stereotype") return events;

    // Validate tribute cards are on own board and face-up
    const faceUpMonsters = zones.board.filter((c) => !c.faceDown);
    for (const tributeId of tributeIds) {
      const onBoard = faceUpMonsters.find((c) => c.cardId === tributeId);
      if (!onBoard) return events;
    }

    // Validate tribute levels sum >= ritual monster level
    const ritualLevel = ritualMonsterDef.level ?? 0;
    let tributeLevelSum = 0;
    for (const tributeId of tributeIds) {
      const tributeCard = faceUpMonsters.find((c) => c.cardId === tributeId);
      if (!tributeCard) return events;
      const tributeDef = state.cardLookup[tributeCard.definitionId];
      tributeLevelSum += tributeDef?.level ?? 0;
    }
    if (tributeLevelSum < ritualLevel) return events;

    // Emit SPELL_ACTIVATED (ritual spell goes to graveyard - normal spell behavior)
    events.push({
      type: "SPELL_ACTIVATED",
      seat,
      cardId,
      targets,
    });

    // Destroy tributes
    for (const tributeId of tributeIds) {
      events.push({ type: "CARD_DESTROYED", cardId: tributeId, reason: "effect" });
      events.push({
        type: "CARD_SENT_TO_GRAVEYARD",
        cardId: tributeId,
        from: "board",
        sourceSeat: seat,
      });
    }

    // Emit RITUAL_SUMMONED
    events.push({
      type: "RITUAL_SUMMONED",
      seat,
      cardId: ritualMonsterId,
      ritualSpellId: cardId,
      tributes: tributeIds,
    });

    return events;
  }

  // Check target availability for the effect being activated
  if (card.effects && card.effects.length > 0) {
    const selectedEffectIndex = effectIndex ?? 0;
    if (selectedEffectIndex >= 0 && selectedEffectIndex < card.effects.length) {
      const eff = card.effects[selectedEffectIndex];
      if (eff) {
        // Block activation if not enough valid targets exist
        if (!hasValidTargets(state, eff, seat)) return events;
        // Validate player-chosen targets if provided
        if (targets.length > 0 && !validateSelectedTargets(state, eff, seat, targets)) return events;
      }
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

  // ── Set quick-play: use chain mechanics like traps ──
  if (card.spellType === "quick-play" && setCard && !inHand) {
    const selectedEffectIndex = effectIndex ?? 0;
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
    events.push({
      type: "SPELL_ACTIVATED",
      seat,
      cardId,
      targets,
    });
    return events;
  }

  // Emit SPELL_ACTIVATED event
  events.push({
    type: "SPELL_ACTIVATED",
    seat,
    cardId,
    targets,
  });

  // For equip spells, emit SPELL_EQUIPPED after SPELL_ACTIVATED
  if (card.spellType === "equip" && targets.length > 0) {
    const targetCardId = targets[0];
    if (targetCardId) {
      events.push({
        type: "SPELL_EQUIPPED",
        seat,
        cardId,
        targetCardId,
      });
    }
  }

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

  // Check target availability for the trap's effect
  if (card.effects && resolvedEffectIndex < card.effects.length) {
    const eff = card.effects[resolvedEffectIndex];
    if (eff) {
      // Block activation if not enough valid targets exist
      if (!hasValidTargets(state, eff, seat)) return events;
      // Validate player-chosen targets if provided
      if (targets.length > 0 && !validateSelectedTargets(state, eff, seat, targets)) return events;
    }
  }

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
      const definitionId = resolveDefinitionId(newState, cardId);
      const newCard: SpellTrapCard = {
        cardId,
        definitionId,
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
      const definitionId = setCard ? setCard.definitionId : resolveDefinitionId(newState, cardId);
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
          definitionId,
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
      // If it's an equip spell: place in spell/trap zone face-up (like continuous)
      else if (card.spellType === "equip") {
        // If from hand, add to spell/trap zone face-up
        if (inHand) {
          const handIndex = hand.indexOf(cardId);
          if (handIndex > -1) {
            hand.splice(handIndex, 1);
          }

          const equipCard: SpellTrapCard = {
            cardId,
            definitionId,
            faceDown: false,
            activated: true,
          };
          spellTrapZone.push(equipCard);
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
            definitionId,
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

    case "SPELL_EQUIPPED": {
      const { seat, cardId, targetCardId } = event;
      const isHost = seat === "host";

      // Add equip cardId to the target monster's equippedCards
      const board = isHost ? [...newState.hostBoard] : [...newState.awayBoard];
      const targetIdx = board.findIndex((c) => c.cardId === targetCardId);
      if (targetIdx > -1) {
        const targetCard = expectDefined(
          board[targetIdx],
          `rules.spellsTraps.evolveSpellTrap missing board card at index ${targetIdx}`
        );

        // Add equip to equipped cards list
        board[targetIdx] = {
          ...targetCard,
          equippedCards: [...targetCard.equippedCards, cardId],
        };

        // Apply stat modifiers from the equip spell's effects (boost_attack, boost_defense)
        const equipDef = getCardDefinition(newState, cardId);
        if (equipDef?.effects) {
          for (const eff of equipDef.effects) {
            for (const action of eff.actions) {
              if (action.type === "boost_attack") {
                const existing = board[targetIdx];
                if (existing) {
                  board[targetIdx] = {
                    ...existing,
                    temporaryBoosts: {
                      ...existing.temporaryBoosts,
                      attack: existing.temporaryBoosts.attack + action.amount,
                    },
                  };
                }
              } else if (action.type === "boost_defense") {
                const existing = board[targetIdx];
                if (existing) {
                  board[targetIdx] = {
                    ...existing,
                    temporaryBoosts: {
                      ...existing.temporaryBoosts,
                      defense: existing.temporaryBoosts.defense + action.amount,
                    },
                  };
                }
              }
            }
          }
        }
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
