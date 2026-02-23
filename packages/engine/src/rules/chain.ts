import type { GameState, Seat } from "../types/index.js";
import type { EngineEvent } from "../types/events.js";
import type { Command } from "../types/commands.js";
import { executeEffect } from "../effects/interpreter.js";
import { evolve } from "../engine.js";
import {
  canActivateEffect,
  generateCostEvents,
  hasValidTargets,
  validateSelectedTargets,
} from "./effects.js";

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
      // Resolve LIFO (last in, first out), skipping negated links
      const negated = state.negatedLinks ?? [];
      const chainLength = state.currentChain.length;
      let resolutionState = state;
      for (let i = chainLength - 1; i >= 0; i--) {
        const link = state.currentChain[i];
        if (!link) continue;
        // Skip negated chain links — their effects don't resolve
        if (negated.includes(i)) continue;
        const cardDef = state.cardLookup[link.cardId];
        if (cardDef) {
          const linkEvents = executeEffect(
            resolutionState,
            cardDef,
            link.effectIndex,
            link.activatingPlayer,
            link.cardId,
            link.targets,
          );
          events.push(...linkEvents);
          resolutionState = evolve(resolutionState, linkEvents, { skipDerivedChecks: true });
        }
      }
    }
  } else if (cardId) {
    // Adding a chain link
    const zones = seat === "host" ? state.hostSpellTrapZone : state.awaySpellTrapZone;
    const setCard = zones.find(c => c.cardId === cardId);
    if (!setCard || !setCard.faceDown) return events;

    const cardDef = state.cardLookup[setCard.definitionId];
    if (!cardDef) return events;
    if (cardDef.type !== "trap" && !(cardDef.type === "spell" && cardDef.spellType === "quick-play")) {
      return events;
    }

    const requestedEffectIndex = resolveEffectIndexForCommand(cardDef, command.effectIndex ?? command.chainLink);
    if (requestedEffectIndex === null) return events;
    const effect = Array.isArray(cardDef.effects) ? cardDef.effects[requestedEffectIndex] : undefined;
    if (!effect) return events;

    // Enforce effect legality during chain responses to avoid client-side desyncs.
    if (!hasValidTargets(state, effect, seat)) return events;
    if (!validateSelectedTargets(state, effect, seat, resolvedTargets)) return events;
    if (!canActivateEffect(state, effect, seat, cardId)) return events;

    if (effect.cost) {
      events.push(...generateCostEvents(state, effect.cost, seat, cardId));
    }

    events.push({
      type: "CHAIN_LINK_ADDED",
      cardId,
      seat,
      effectIndex: requestedEffectIndex,
      targets: resolvedTargets,
    });

    // Activate the card (trap or set quick-play spell) — move to graveyard etc.
    if (cardDef.type === "spell" && cardDef.spellType === "quick-play") {
      events.push({
        type: "SPELL_ACTIVATED",
        seat,
        cardId,
        targets: resolvedTargets,
      });
    } else {
      events.push({
        type: "TRAP_ACTIVATED",
        seat,
        cardId,
        targets: resolvedTargets,
      });
    }
  }

  return events;
}
