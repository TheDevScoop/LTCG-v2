import type { GameState } from "@lunchtable/engine";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readInstanceMapping(state: GameState): Record<string, string> {
  const raw = (state as { instanceToDefinition?: unknown }).instanceToDefinition;
  if (!isRecord(raw)) return {};

  const mapping: Record<string, string> = {};
  for (const [instanceId, definitionId] of Object.entries(raw)) {
    if (typeof definitionId === "string") {
      mapping[instanceId] = definitionId;
    }
  }
  return mapping;
}

function addMapping(
  mapping: Record<string, string>,
  instanceId: unknown,
  definitionId?: unknown,
) {
  if (typeof instanceId !== "string" || instanceId.length === 0) return;
  if (typeof definitionId === "string" && definitionId.length > 0) {
    mapping[instanceId] = definitionId;
    return;
  }
  if (!mapping[instanceId]) {
    mapping[instanceId] = instanceId;
  }
}

export function ensureInstanceMapping(state: GameState): GameState {
  const existing = readInstanceMapping(state);
  const mapping: Record<string, string> = { ...existing };

  const addCardIdArray = (cardIds: string[]) => {
    for (const cardId of cardIds) {
      addMapping(mapping, cardId, mapping[cardId] ?? cardId);
    }
  };

  addCardIdArray(state.hostHand);
  addCardIdArray(state.hostDeck);
  addCardIdArray(state.hostGraveyard);
  addCardIdArray(state.hostBanished);
  addCardIdArray(state.awayHand);
  addCardIdArray(state.awayDeck);
  addCardIdArray(state.awayGraveyard);
  addCardIdArray(state.awayBanished);

  for (const card of state.hostBoard) {
    addMapping(mapping, card.cardId, card.definitionId);
  }
  for (const card of state.awayBoard) {
    addMapping(mapping, card.cardId, card.definitionId);
  }
  for (const card of state.hostSpellTrapZone) {
    addMapping(mapping, card.cardId, card.definitionId);
  }
  for (const card of state.awaySpellTrapZone) {
    addMapping(mapping, card.cardId, card.definitionId);
  }
  if (state.hostFieldSpell) {
    addMapping(mapping, state.hostFieldSpell.cardId, state.hostFieldSpell.definitionId);
  }
  if (state.awayFieldSpell) {
    addMapping(mapping, state.awayFieldSpell.cardId, state.awayFieldSpell.definitionId);
  }

  for (const link of state.currentChain) {
    addMapping(mapping, link.cardId, mapping[link.cardId] ?? link.cardId);
    for (const targetId of link.targets ?? []) {
      addMapping(mapping, targetId, mapping[targetId] ?? targetId);
    }
  }

  if (state.pendingPong?.destroyedCardId) {
    addMapping(
      mapping,
      state.pendingPong.destroyedCardId,
      mapping[state.pendingPong.destroyedCardId] ?? state.pendingPong.destroyedCardId,
    );
  }

  return {
    ...state,
    instanceToDefinition: mapping,
  };
}

