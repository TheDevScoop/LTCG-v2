import { describe, expect, it } from "vitest";
import { gameOverSummary } from "../actions/turnLogic.js";
import type { PlayerView } from "../types.js";

/** Minimal PlayerView stub with only the fields gameOverSummary reads. */
function stubView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    gameOver: true,
    phase: "end",
    currentTurnPlayer: "host",
    hand: [],
    board: [],
    ...overrides,
  };
}

describe("gameOverSummary", () => {
  it("returns VICTORY when myLP > oppLP", () => {
    const view = stubView({ lifePoints: 5000, opponentLifePoints: 0 });
    expect(gameOverSummary(view, "host")).toMatch(/VICTORY/);
  });

  it("returns DEFEAT when myLP < oppLP", () => {
    const view = stubView({ lifePoints: 0, opponentLifePoints: 3000 });
    expect(gameOverSummary(view, "host")).toMatch(/DEFEAT/);
  });

  it("returns DRAW when LP are equal", () => {
    const view = stubView({ lifePoints: 2000, opponentLifePoints: 2000 });
    expect(gameOverSummary(view, "host")).toMatch(/DRAW/);
  });

  it("treats NaN lifePoints as 0", () => {
    const view = stubView({ lifePoints: NaN, opponentLifePoints: 1000 });
    const result = gameOverSummary(view, "host");
    expect(result).toMatch(/DEFEAT/);
    expect(result).toContain("You: 0 LP");
  });

  it("treats undefined lifePoints as 0 via players path", () => {
    // No lifePoints, no opponentLifePoints, no players → both resolve to 0
    const view = stubView({});
    const result = gameOverSummary(view, "host");
    expect(result).toMatch(/DRAW/);
    expect(result).toContain("Both: 0 LP");
  });

  it("treats NaN in players.host.lifePoints as 0", () => {
    const view = stubView({
      players: {
        host: { lifePoints: NaN },
        away: { lifePoints: 500 },
      },
    });
    const result = gameOverSummary(view, "host");
    expect(result).toMatch(/DEFEAT/);
    expect(result).toContain("You: 0 LP");
    expect(result).toContain("Opponent: 500 LP");
  });
});
