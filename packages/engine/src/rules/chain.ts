import type { GameState, Seat } from "../types/index.js";
import type { EngineEvent } from "../types/events.js";
import type { Command } from "../types/commands.js";
import { executeEffect } from "../effects/interpreter.js";

export function decideChainResponse(
  state: GameState,
  seat: Seat,
  command: Extract<Command, { type: "CHAIN_RESPONSE" }>,
): EngineEvent[] {
  const events: EngineEvent[] = [];

  if (command.pass) {
    events.push({ type: "CHAIN_PASSED", seat });

    // Check if both players passed — resolve chain
    if (state.currentChain.length > 0) {
      events.push({ type: "CHAIN_RESOLVED" });
      // Resolve LIFO (last in, first out)
      const chain = [...state.currentChain].reverse();
      for (const link of chain) {
        const cardDef = state.cardLookup[link.cardId];
        if (cardDef) {
          events.push(...executeEffect(
            state, cardDef, link.effectIndex, link.activatingPlayer, link.cardId, link.targets,
          ));
        }
      }
    }
  } else if (command.cardId) {
    // Adding a chain link
    const cardId = command.cardId;
    const zones = seat === "host" ? state.hostSpellTrapZone : state.awaySpellTrapZone;
    const setCard = zones.find(c => c.cardId === cardId);
    if (!setCard) return events;

    const cardDef = state.cardLookup[setCard.definitionId];
    if (!cardDef) return events;

    // For now, use effect index 0 if the card has effects
    const effectIndex = cardDef.effects && cardDef.effects.length > 0 ? 0 : 0;

    events.push({
      type: "CHAIN_LINK_ADDED",
      cardId,
      seat,
      effectIndex,
    });

    // Activate the trap (move to graveyard etc.)
    events.push({
      type: "TRAP_ACTIVATED",
      seat,
      cardId,
      targets: [],
    });
  }

  return events;
}
