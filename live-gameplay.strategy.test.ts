import { describe, expect, it } from "vitest";
import { choosePhaseCommand, type PlayerView } from "./scripts/live-gameplay/strategy";

const cardLookup = {
  monster_a: { cardType: "stereotype", attack: 1800, level: 4 },
  spell_a: { cardType: "spell" },
} as Record<string, any>;

describe("live gameplay strategy", () => {
  it("does not attempt SUMMON in main phase after normal summon was used", () => {
    const view: PlayerView = {
      currentPhase: "main",
      hand: ["monster_a"],
      board: [],
      normalSummonedThisTurn: true,
    };

    const command = choosePhaseCommand(view, cardLookup);
    expect(command.type).not.toBe("SUMMON");
    expect(command.type).toBe("ADVANCE_PHASE");
  });

  it("uses END_TURN in main2 when no summon/backrow action is available", () => {
    const view: PlayerView = {
      currentPhase: "main2",
      hand: ["monster_a"],
      board: [],
      spellTrapZone: [{ cardId: "set_1" }, { cardId: "set_2" }, { cardId: "set_3" }],
      maxSpellTrapSlots: 3,
      normalSummonedThisTurn: true,
    };

    const command = choosePhaseCommand(view, cardLookup);
    expect(command.type).toBe("END_TURN");
  });
});
