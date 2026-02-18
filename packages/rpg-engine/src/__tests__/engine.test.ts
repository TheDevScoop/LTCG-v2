import { describe, expect, it } from "vitest";
import { createSessionState, evolve, rollDice } from "../index.js";

describe("rpg-engine deterministic behavior", () => {
  it("rolls deterministically with the same seed hint", () => {
    const a = rollDice("2d6+3", "seed-1");
    const b = rollDice("2d6+3", "seed-1");
    expect(a).toEqual(b);
  });

  it("advances turn and updates phase", () => {
    const state = createSessionState("session_1", "world_1");
    const { state: next } = evolve(state, {
      actorSeat: "dm",
      actionType: "ADVANCE_TURN",
      payload: {},
    });
    expect(next.turn).toBe(2);
    expect(next.phase).toBe("briefing");
  });
});
