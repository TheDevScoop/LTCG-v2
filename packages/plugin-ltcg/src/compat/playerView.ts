import type { BoardCard, PlayerView } from "../types.js";

function toCardArray(value: unknown): BoardCard[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is BoardCard =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
  );
}

function mergeMonsters(
  modern: unknown,
  compatibilityFallback: unknown,
): BoardCard[] {
  return [
    ...toCardArray(compatibilityFallback),
    ...toCardArray(modern),
  ];
}

function mergeSpellTrapZone(
  modern: unknown,
  compatibilityFallback: unknown,
): BoardCard[] {
  return [
    ...toCardArray(modern),
    ...toCardArray(compatibilityFallback),
  ];
}

/**
 * Normalize mixed-version PlayerView payloads into canonical board fields.
 * This keeps compatibility handling at the API boundary.
 */
export function normalizePlayerViewForCompatibility(view: PlayerView): PlayerView {
  const board = mergeMonsters(view.board, view.playerField?.monsters);
  const opponentBoard = mergeMonsters(
    view.opponentBoard,
    view.opponentField?.monsters,
  );
  const spellTrapZone = mergeSpellTrapZone(
    view.spellTrapZone,
    view.playerField?.spellTraps,
  );

  return {
    ...view,
    hand: Array.isArray(view.hand) ? view.hand : [],
    board,
    opponentBoard,
    spellTrapZone,
  };
}
