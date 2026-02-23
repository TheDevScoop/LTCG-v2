import type { CardDefinition } from "./types/cards.js";
import type { GameState, Seat, SpellTrapCard } from "./types/state.js";

export function resolveDefinitionId(
  state: Pick<GameState, "instanceToDefinition"> | { instanceToDefinition?: Record<string, string> },
  id: string
): string {
  return state.instanceToDefinition?.[id] ?? id;
}

export function getCardDefinition(
  state: Pick<GameState, "instanceToDefinition" | "cardLookup">,
  id: string
): CardDefinition | undefined {
  return state.cardLookup[resolveDefinitionId(state, id)];
}

export function isInstanceIdKnown(
  state: Pick<GameState, "instanceToDefinition"> | { instanceToDefinition?: Record<string, string> },
  id: string
): boolean {
  return Object.prototype.hasOwnProperty.call(state.instanceToDefinition ?? {}, id);
}

function mapVisibleSpellTrap(
  definitions: Record<string, string>,
  state: GameState,
  zone: SpellTrapCard[],
  includeFaceDown: boolean
) {
  for (const card of zone) {
    if (!includeFaceDown && card.faceDown) continue;
    const defId = resolveDefinitionId(state, card.cardId);
    definitions[card.cardId] = defId;
  }
}

/**
 * Build definition mappings for all instance IDs visible to the given seat.
 * This intentionally avoids leaking opponent face-down definitions.
 */
export function buildVisibleInstanceDefinitions(state: GameState, seat: Seat): Record<string, string> {
  const defs: Record<string, string> = {};
  const isHost = seat === "host";

  const myHand = isHost ? state.hostHand : state.awayHand;
  const myBoard = isHost ? state.hostBoard : state.awayBoard;
  const mySpellTrap = isHost ? state.hostSpellTrapZone : state.awaySpellTrapZone;
  const myField = isHost ? state.hostFieldSpell : state.awayFieldSpell;
  const myGraveyard = isHost ? state.hostGraveyard : state.awayGraveyard;
  const myBanished = isHost ? state.hostBanished : state.awayBanished;

  const oppBoard = isHost ? state.awayBoard : state.hostBoard;
  const oppSpellTrap = isHost ? state.awaySpellTrapZone : state.hostSpellTrapZone;
  const oppField = isHost ? state.awayFieldSpell : state.hostFieldSpell;
  const oppGraveyard = isHost ? state.awayGraveyard : state.hostGraveyard;
  const oppBanished = isHost ? state.awayBanished : state.hostBanished;

  for (const id of myHand) defs[id] = resolveDefinitionId(state, id);
  for (const card of myBoard) defs[card.cardId] = resolveDefinitionId(state, card.cardId);
  mapVisibleSpellTrap(defs, state, mySpellTrap, true);
  if (myField) defs[myField.cardId] = resolveDefinitionId(state, myField.cardId);
  for (const id of myGraveyard) defs[id] = resolveDefinitionId(state, id);
  for (const id of myBanished) defs[id] = resolveDefinitionId(state, id);

  for (const card of oppBoard) {
    if (card.faceDown) continue;
    defs[card.cardId] = resolveDefinitionId(state, card.cardId);
  }
  mapVisibleSpellTrap(defs, state, oppSpellTrap, false);
  if (oppField && !oppField.faceDown) {
    defs[oppField.cardId] = resolveDefinitionId(state, oppField.cardId);
  }
  for (const id of oppGraveyard) defs[id] = resolveDefinitionId(state, id);
  for (const id of oppBanished) defs[id] = resolveDefinitionId(state, id);

  if (state.pendingPong) {
    defs[state.pendingPong.destroyedCardId] = resolveDefinitionId(state, state.pendingPong.destroyedCardId);
  }

  for (const link of state.currentChain) {
    defs[link.cardId] = resolveDefinitionId(state, link.cardId);
    for (const target of link.targets) {
      defs[target] = resolveDefinitionId(state, target);
    }
  }

  return defs;
}
