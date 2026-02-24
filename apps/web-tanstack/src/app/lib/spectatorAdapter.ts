/**
 * Adapts PublicSpectatorSlot data into the shapes expected by
 * FieldRow (BoardCard) and SpellTrapRow (SpellTrapCard).
 */

import type { BoardCard } from "@/components/game/types";
import type { PublicSpectatorSlot } from "@/hooks/useAgentSpectator";

/** SpellTrapCard shape matching SpellTrapRow's local interface */
export type SpectatorSpellTrapCard = {
  cardId: string;
  definitionId: string;
  faceDown?: boolean;
  activated?: boolean;
};

/**
 * Convert an array of spectator monster slots into a sparse BoardCard array
 * indexed by lane, as FieldRow expects.
 */
export function spectatorMonstersToBoardCards(
  slots: PublicSpectatorSlot[],
): BoardCard[] {
  const result: BoardCard[] = [];

  for (const slot of slots) {
    if (!slot.occupied) continue;

    result[slot.lane] = {
      cardId: `spec-mon-${slot.lane}`,
      definitionId: slot.definitionId ?? "unknown",
      position: slot.position ?? "attack",
      faceDown: slot.faceDown,
    };
  }

  return result;
}

/**
 * Convert an array of spectator spell/trap slots into a sparse SpellTrapCard array
 * indexed by lane, as SpellTrapRow expects.
 */
export function spectatorSpellTrapsToCards(
  slots: PublicSpectatorSlot[],
): SpectatorSpellTrapCard[] {
  const result: SpectatorSpellTrapCard[] = [];

  for (const slot of slots) {
    if (!slot.occupied) continue;

    result[slot.lane] = {
      cardId: `spec-st-${slot.lane}`,
      definitionId: slot.definitionId ?? "unknown",
      faceDown: slot.faceDown,
    };
  }

  return result;
}
