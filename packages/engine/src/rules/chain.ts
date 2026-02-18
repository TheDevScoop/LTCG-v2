import type { GameState, Seat } from "../types/index.js";
import type { EngineEvent } from "../types/events.js";
import type { Command } from "../types/commands.js";
import { executeEffect } from "../effects/interpreter.js";

function parseEffectIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return null;
}

function resolveEffectIndexForCommand(cardDef: { effects?: unknown[] }, rawIndex: unknown): number | null {
  const requested = parseEffectIndex(rawIndex);
  const effectCount = Array.isArray(cardDef.effects) ? cardDef.effects.length : 0;
  if (effectCount <= 0) return null;
  if (requested === null) return 0;
  return requested < effectCount ? requested : null;
}

export function decideChainResponse(
  state: GameState,
  seat: Seat,
  command: Extract<Command, { type: "CHAIN_RESPONSE" }>,
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const chainInProgress = state.currentChain.length > 0;
  if (!chainInProgress || state.currentPriorityPlayer !== seat) {
    return events;
  }

  const rawTargets = command.targets;
  const resolvedTargets = Array.isArray(rawTargets)
    ? rawTargets.filter((target): target is string => typeof target === "string")
    : [];
  const cardId = command.cardId ?? command.sourceCardId;

  if (command.pass) {
    events.push({ type: "CHAIN_PASSED", seat });

    if (
      state.currentChain.length > 0 &&
      state.currentChainPasser !== null &&
      state.currentChainPasser !== seat
    ) {
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
  } else if (cardId) {
    // Adding a chain link
    const zones = seat === "host" ? state.hostSpellTrapZone : state.awaySpellTrapZone;
    const setCard = zones.find(c => c.cardId === cardId);
    if (!setCard) return events;

    const cardDef = state.cardLookup[setCard.definitionId];
    if (!cardDef) return events;

    const requestedEffectIndex = resolveEffectIndexForCommand(cardDef, command.effectIndex ?? command.chainLink);
    if (requestedEffectIndex === null) return events;

    events.push({
      type: "CHAIN_LINK_ADDED",
      cardId,
      seat,
      effectIndex: requestedEffectIndex,
      targets: resolvedTargets,
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
