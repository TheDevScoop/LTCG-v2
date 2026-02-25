import { describe, expect, it } from "vitest";
import { normalizePlayerViewForCompatibility } from "../compat/playerView.js";
import type { PlayerView } from "../types.js";

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    gameOver: false,
    phase: "main",
    currentTurnPlayer: "host",
    hand: [],
    board: [],
    opponentBoard: [],
    ...overrides,
  };
}

describe("normalizePlayerViewForCompatibility", () => {
  it("merges compatibility monster fields into canonical board arrays", () => {
    const view = makeView({
      board: [{ cardId: "modern-board" } as any],
      opponentBoard: [{ cardId: "modern-opp" } as any],
      playerField: { monsters: [{ cardId: "compat-board" } as any] },
      opponentField: { monsters: [{ cardId: "compat-opp" } as any] },
    });

    const normalized = normalizePlayerViewForCompatibility(view);

    expect(normalized.board.map((card) => card.cardId)).toEqual([
      "compat-board",
      "modern-board",
    ]);
    expect(normalized.opponentBoard.map((card) => card.cardId)).toEqual([
      "compat-opp",
      "modern-opp",
    ]);
  });

  it("appends compatibility spell/trap entries after modern spellTrapZone", () => {
    const view = makeView({
      spellTrapZone: [{ cardId: "modern-trap" } as any],
      playerField: {
        monsters: [],
        spellTraps: [{ cardId: "compat-trap" } as any],
      },
    });

    const normalized = normalizePlayerViewForCompatibility(view);
    expect((normalized.spellTrapZone ?? []).map((card) => card.cardId)).toEqual([
      "modern-trap",
      "compat-trap",
    ]);
  });

  it("keeps canonical arrays stable when compatibility fields are absent", () => {
    const view = makeView({
      hand: ["card_a"],
      board: [{ cardId: "board_a" } as any],
      opponentBoard: [{ cardId: "board_b" } as any],
      spellTrapZone: [{ cardId: "trap_a" } as any],
    });

    const normalized = normalizePlayerViewForCompatibility(view);

    expect(normalized.hand).toEqual(["card_a"]);
    expect(normalized.board.map((card) => card.cardId)).toEqual(["board_a"]);
    expect(normalized.opponentBoard.map((card) => card.cardId)).toEqual([
      "board_b",
    ]);
    expect((normalized.spellTrapZone ?? []).map((card) => card.cardId)).toEqual([
      "trap_a",
    ]);
  });
});
