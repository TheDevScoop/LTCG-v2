import { describe, it, expect } from "vitest";
import type { PublicSpectatorSlot } from "@/hooks/useAgentSpectator";
import {
  spectatorMonstersToBoardCards,
  spectatorSpellTrapsToCards,
} from "./spectatorAdapter";

const makeSlot = (overrides: Partial<PublicSpectatorSlot> & { lane: number }): PublicSpectatorSlot => ({
  occupied: true,
  faceDown: false,
  position: "attack",
  name: null,
  attack: null,
  defense: null,
  kind: "monster",
  definitionId: null,
  ...overrides,
});

describe("spectatorMonstersToBoardCards", () => {
  it("returns empty array for empty input", () => {
    expect(spectatorMonstersToBoardCards([])).toEqual([]);
  });

  it("converts a single occupied slot", () => {
    const slots = [makeSlot({ lane: 0, definitionId: "card_1", position: "attack" })];
    const result = spectatorMonstersToBoardCards(slots);
    expect(result[0]).toEqual({
      cardId: "spec-mon-0",
      definitionId: "card_1",
      position: "attack",
      faceDown: false,
    });
  });

  it("converts multiple occupied slots", () => {
    const slots = [
      makeSlot({ lane: 0, definitionId: "card_1" }),
      makeSlot({ lane: 1, definitionId: "card_2", position: "defense" }),
      makeSlot({ lane: 2, definitionId: "card_3", faceDown: true }),
    ];
    const result = spectatorMonstersToBoardCards(slots);
    expect(result[0]?.definitionId).toBe("card_1");
    expect(result[1]?.definitionId).toBe("card_2");
    expect(result[1]?.position).toBe("defense");
    expect(result[2]?.faceDown).toBe(true);
  });

  it("skips unoccupied slots", () => {
    const slots = [
      makeSlot({ lane: 0, occupied: false }),
      makeSlot({ lane: 1, definitionId: "card_2" }),
    ];
    const result = spectatorMonstersToBoardCards(slots);
    expect(result[0]).toBeUndefined();
    expect(result[1]?.definitionId).toBe("card_2");
  });

  it("indexes by lane creating sparse array", () => {
    const slots = [makeSlot({ lane: 2, definitionId: "card_x" })];
    const result = spectatorMonstersToBoardCards(slots);
    expect(result[0]).toBeUndefined();
    expect(result[1]).toBeUndefined();
    expect(result[2]?.cardId).toBe("spec-mon-2");
  });

  it("maps faceDown correctly", () => {
    const slots = [makeSlot({ lane: 0, faceDown: true, definitionId: "card_1" })];
    const result = spectatorMonstersToBoardCards(slots);
    expect(result[0]?.faceDown).toBe(true);
  });

  it("uses 'unknown' when definitionId is null", () => {
    const slots = [makeSlot({ lane: 0, definitionId: null })];
    const result = spectatorMonstersToBoardCards(slots);
    expect(result[0]?.definitionId).toBe("unknown");
  });
});

describe("spectatorSpellTrapsToCards", () => {
  it("returns empty array for empty input", () => {
    expect(spectatorSpellTrapsToCards([])).toEqual([]);
  });

  it("converts a single occupied slot", () => {
    const slots = [makeSlot({ lane: 0, kind: "spell", definitionId: "spell_1" })];
    const result = spectatorSpellTrapsToCards(slots);
    expect(result[0]).toEqual({
      cardId: "spec-st-0",
      definitionId: "spell_1",
      faceDown: false,
    });
  });

  it("converts multiple occupied slots", () => {
    const slots = [
      makeSlot({ lane: 0, kind: "spell", definitionId: "spell_1" }),
      makeSlot({ lane: 1, kind: "trap", definitionId: "trap_1", faceDown: true }),
    ];
    const result = spectatorSpellTrapsToCards(slots);
    expect(result[0]?.definitionId).toBe("spell_1");
    expect(result[1]?.definitionId).toBe("trap_1");
    expect(result[1]?.faceDown).toBe(true);
  });

  it("skips unoccupied slots", () => {
    const slots = [
      makeSlot({ lane: 0, occupied: false, kind: "spell" }),
      makeSlot({ lane: 1, kind: "trap", definitionId: "trap_1" }),
    ];
    const result = spectatorSpellTrapsToCards(slots);
    expect(result[0]).toBeUndefined();
    expect(result[1]?.definitionId).toBe("trap_1");
  });

  it("indexes by lane creating sparse array", () => {
    const slots = [makeSlot({ lane: 2, kind: "trap", definitionId: "trap_x" })];
    const result = spectatorSpellTrapsToCards(slots);
    expect(result[0]).toBeUndefined();
    expect(result[1]).toBeUndefined();
    expect(result[2]?.cardId).toBe("spec-st-2");
  });

  it("uses 'unknown' when definitionId is null", () => {
    const slots = [makeSlot({ lane: 0, kind: "spell", definitionId: null })];
    const result = spectatorSpellTrapsToCards(slots);
    expect(result[0]?.definitionId).toBe("unknown");
  });
});
