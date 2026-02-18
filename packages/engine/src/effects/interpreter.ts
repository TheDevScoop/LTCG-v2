/**
 * interpreter.ts
 *
 * High-level effect execution:
 * - Locate ability by trigger
 * - Execute all actions in an ability
 * - Return aggregate events
 */

import type { GameState, Seat } from "../types/state.js";
import type { EngineEvent } from "../types/events.js";
import type { CardDefinition, EffectDefinition } from "../types/cards.js";
import { executeAction } from "./operations.js";
import { expectDefined } from "../internal/invariant.js";

/**
 * Execute a specific effect from a card definition.
 * @param state Current game state
 * @param cardDefinition Card definition containing effects
 * @param abilityIndex Index of the ability/effect to execute
 * @param activatingPlayer Player activating the effect
 * @param sourceCardId Card ID of the activating card
 * @param targets Array of target card IDs
 * @returns Array of generated events
 */
export function executeEffect(
  state: GameState,
  cardDefinition: CardDefinition,
  abilityIndex: number,
  activatingPlayer: Seat,
  sourceCardId: string,
  targets: string[]
): EngineEvent[] {
  if (!cardDefinition.effects || abilityIndex >= cardDefinition.effects.length || abilityIndex < 0) {
    return [];
  }

  const ability = expectDefined(
    cardDefinition.effects[abilityIndex],
    `effects.interpreter.executeEffect missing ability at index ${abilityIndex}`
  );

  const events: EngineEvent[] = [];

  for (const action of ability.actions) {
    const actionEvents = executeAction(state, action, activatingPlayer, sourceCardId, targets);
    events.push(...actionEvents);
  }

  return events;
}

/**
 * Find an ability/effect by its trigger type.
 * @param cardDefinition Card definition to search
 * @param trigger Trigger type to search for
 * @returns Object with index and ability, or null if not found
 */
export function findAbilityByTrigger(
  cardDefinition: CardDefinition,
  trigger: EffectDefinition["type"]
): { index: number; ability: EffectDefinition } | null {
  if (!cardDefinition.effects) return null;

  const index = cardDefinition.effects.findIndex((eff) => eff.type === trigger);
  if (index === -1) return null;

  return {
    index,
    ability: expectDefined(
      cardDefinition.effects[index],
      `effects.interpreter.findAbilityByTrigger missing ability at index ${index}`
    ),
  };
}
