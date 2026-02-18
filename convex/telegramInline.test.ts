import { describe, expect, it } from "vitest";
import {
  deriveInlinePrimaryCommands,
  fallbackInlineCommands,
  paginateInlineCommands,
} from "./telegramInline";

describe("telegramInline helpers", () => {
  it("derives legal main-phase commands from view state", () => {
    const commands = deriveInlinePrimaryCommands({
      seat: "host",
      view: {
        currentTurnPlayer: "host",
        currentPriorityPlayer: "host",
        currentPhase: "main",
        turnNumber: 2,
        gameOver: false,
        currentChain: [],
        hand: ["monsterCard", "spellCard", "trapCard"],
        board: [],
        opponentBoard: [],
        spellTrapZone: [],
      },
      cardMetaById: new Map([
        ["monsterCard", { type: "stereotype", level: 4 }],
        ["spellCard", { type: "spell", level: 0 }],
        ["trapCard", { type: "trap", level: 0 }],
      ]),
    });

    const commandTypes = commands.map((entry) => entry.command.type);
    expect(commandTypes).toContain("SUMMON");
    expect(commandTypes).toContain("SET_MONSTER");
    expect(commandTypes).toContain("SET_SPELL_TRAP");
    expect(commandTypes).toContain("ACTIVATE_SPELL");
  });

  it("derives chain responder trap activation commands from open prompt data", () => {
    const commands = deriveInlinePrimaryCommands({
      seat: "host",
      view: {
        currentTurnPlayer: "away",
        currentPriorityPlayer: "host",
        currentPhase: "main",
        turnNumber: 2,
        gameOver: false,
        currentChain: [{ cardId: "x" }],
        hand: [],
        board: [],
        opponentBoard: [],
        spellTrapZone: [{ cardId: "setTrap", definitionId: "trapDef", faceDown: true }],
      },
      cardMetaById: new Map([["trapDef", { type: "trap", level: 0 }]]),
      openPromptData: {
        activatableTraps: [{ cardId: "setTrap" }],
      },
    });

    const serialized = commands.map((entry) => JSON.stringify(entry.command));
    expect(serialized).toContain(JSON.stringify({ type: "ACTIVATE_TRAP", cardId: "setTrap" }));
    expect(serialized).toContain(JSON.stringify({ type: "CHAIN_RESPONSE", pass: true }));
  });

  it("always exposes deterministic fallback commands", () => {
    const fallback = fallbackInlineCommands().map((entry) => entry.command.type);
    expect(fallback).toEqual(["ADVANCE_PHASE", "END_TURN", "SURRENDER"]);
  });

  it("paginates and clamps command pages", () => {
    const items = Array.from({ length: 11 }, (_, idx) => `item-${idx}`);
    const paged = paginateInlineCommands(items, 99, 4);
    expect(paged.totalPages).toBe(3);
    expect(paged.page).toBe(2);
    expect(paged.items).toEqual(["item-8", "item-9", "item-10"]);
  });
});
