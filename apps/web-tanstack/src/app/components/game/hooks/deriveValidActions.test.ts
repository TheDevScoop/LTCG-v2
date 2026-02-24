import { describe, it, expect } from "vitest";
import { deriveValidActions } from "./deriveValidActions";

// Minimal card lookup for testing
const cardLookup: Record<string, any> = {
  monster_1: {
    _id: "monster_1",
    name: "Basic Monster",
    cardType: "stereotype",
    level: 4,
    attack: 1500,
    defense: 1000,
  },
  ignition_monster: {
    _id: "ignition_monster",
    name: "Ignition Monster",
    cardType: "stereotype",
    level: 4,
    attack: 1200,
    defense: 800,
    effects: [
      {
        id: "ign_eff",
        type: "ignition",
        description: "Draw 1",
        actions: [{ type: "draw", count: 1 }],
      },
    ],
  },
  trigger_monster: {
    _id: "trigger_monster",
    name: "Trigger Monster",
    cardType: "stereotype",
    level: 3,
    attack: 1000,
    defense: 1000,
    effects: [
      {
        id: "trig_eff",
        type: "trigger",
        description: "On destroy draw 1",
        actions: [{ type: "draw", count: 1 }],
      },
    ],
  },
  spell_1: {
    _id: "spell_1",
    name: "Normal Spell",
    cardType: "spell",
    spellType: "normal",
  },
  qp_spell: {
    _id: "qp_spell",
    name: "Quick Spell",
    cardType: "spell",
    spellType: "quick-play",
  },
  trap_1: {
    _id: "trap_1",
    name: "Normal Trap",
    cardType: "trap",
    trapType: "normal",
  },
};

function makeView(overrides: Record<string, any> = {}): any {
  return {
    hand: [],
    board: [],
    spellTrapZone: [],
    opponentBoard: [],
    currentPhase: "main",
    normalSummonedThisTurn: false,
    turnNumber: 2,
    maxBoardSlots: 3,
    maxSpellTrapSlots: 3,
    ...overrides,
  };
}

function makeBoardCard(overrides: Record<string, any> = {}): any {
  return {
    cardId: "board_card_1",
    definitionId: "monster_1",
    faceDown: false,
    position: "attack",
    canAttack: true,
    hasAttackedThisTurn: false,
    changedPositionThisTurn: false,
    turnSummoned: 1,
    ...overrides,
  };
}

function makeSpellTrapCard(overrides: Record<string, any> = {}): any {
  return {
    cardId: "st_card_1",
    definitionId: "spell_1",
    faceDown: true,
    ...overrides,
  };
}

describe("deriveValidActions: returns empty when disabled", () => {
  it("returns all empty when view is null", () => {
    const result = deriveValidActions({
      view: null,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canSummon.size).toBe(0);
    expect(result.canSetMonster.size).toBe(0);
    expect(result.canSetSpellTrap.size).toBe(0);
    expect(result.canActivateSpell.size).toBe(0);
    expect(result.canActivateTrap.size).toBe(0);
    expect(result.canActivateEffect.size).toBe(0);
    expect(result.canAttack.size).toBe(0);
    expect(result.canFlipSummon.size).toBe(0);
    expect(result.canChangePosition.size).toBe(0);
  });

  it("returns all empty when gameOver is true", () => {
    const view = makeView({ hand: ["monster_1"] });
    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: true,
    });

    expect(result.canSummon.size).toBe(0);
    expect(result.canSetMonster.size).toBe(0);
    expect(result.canSetSpellTrap.size).toBe(0);
    expect(result.canActivateSpell.size).toBe(0);
    expect(result.canActivateTrap.size).toBe(0);
    expect(result.canActivateEffect.size).toBe(0);
    expect(result.canAttack.size).toBe(0);
    expect(result.canFlipSummon.size).toBe(0);
    expect(result.canChangePosition.size).toBe(0);
  });
});

describe("deriveValidActions: instanceDefinitions", () => {
  it("uses instanceDefinitions for hand cards", () => {
    const view = makeView({
      hand: ["h:1:monster_1"],
      instanceDefinitions: {
        "h:1:monster_1": "monster_1",
      },
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canSummon.has("h:1:monster_1")).toBe(true);
    expect(result.canSetMonster.has("h:1:monster_1")).toBe(true);
  });
});

describe("deriveValidActions: canActivateEffect", () => {
  it("populates canActivateEffect for face-up board monster with ignition effect", () => {
    const view = makeView({
      board: [
        makeBoardCard({
          cardId: "ignition_monster",
          definitionId: "ignition_monster",
          faceDown: false,
        }),
      ],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canActivateEffect.has("ignition_monster")).toBe(true);
    expect(result.canActivateEffect.get("ignition_monster")).toEqual([0]);
  });

  it("does NOT include trigger-only effects in canActivateEffect", () => {
    const view = makeView({
      board: [
        makeBoardCard({
          cardId: "trigger_monster",
          definitionId: "trigger_monster",
          faceDown: false,
        }),
      ],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canActivateEffect.size).toBe(0);
  });

  it("does NOT include face-down monsters in canActivateEffect", () => {
    const view = makeView({
      board: [
        makeBoardCard({
          cardId: "ignition_monster",
          definitionId: "ignition_monster",
          faceDown: true,
        }),
      ],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canActivateEffect.size).toBe(0);
  });

  it("does NOT populate canActivateEffect during combat phase", () => {
    const view = makeView({
      currentPhase: "combat",
      board: [
        makeBoardCard({
          cardId: "ignition_monster",
          definitionId: "ignition_monster",
          faceDown: false,
        }),
      ],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canActivateEffect.size).toBe(0);
  });
});

describe("deriveValidActions: opponent's turn", () => {
  it("populates canActivateTrap for set traps during opponent's turn", () => {
    const view = makeView({
      spellTrapZone: [
        makeSpellTrapCard({
          cardId: "trap_1",
          definitionId: "trap_1",
          faceDown: true,
        }),
      ],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: false,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canActivateTrap.has("trap_1")).toBe(true);
  });

  it("populates canActivateSpell for quick-play spells during opponent's turn", () => {
    const view = makeView({
      spellTrapZone: [
        makeSpellTrapCard({
          cardId: "qp_spell",
          definitionId: "qp_spell",
          faceDown: true,
        }),
      ],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: false,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canActivateSpell.has("qp_spell")).toBe(true);
  });

  it("does NOT populate canSummon during opponent's turn", () => {
    const view = makeView({
      hand: ["monster_1"],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: false,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canSummon.size).toBe(0);
  });

  it("does NOT populate canActivateSpell for normal spells set during opponent's turn", () => {
    const view = makeView({
      spellTrapZone: [
        makeSpellTrapCard({
          cardId: "spell_1",
          definitionId: "spell_1",
          faceDown: true,
        }),
      ],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: false,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canActivateSpell.size).toBe(0);
  });
});

describe("deriveValidActions: chain window", () => {
  it("chain responder gets trap and quick-play activation", () => {
    const view = makeView({
      spellTrapZone: [
        makeSpellTrapCard({
          cardId: "trap_1",
          definitionId: "trap_1",
          faceDown: true,
        }),
        makeSpellTrapCard({
          cardId: "qp_spell",
          definitionId: "qp_spell",
          faceDown: true,
        }),
      ],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: false,
      isChainWindow: true,
      isChainResponder: true,
      gameOver: false,
    });

    expect(result.canActivateTrap.has("trap_1")).toBe(true);
    expect(result.canActivateSpell.has("qp_spell")).toBe(true);
  });

  it("non-responder gets nothing during chain window", () => {
    const view = makeView({
      spellTrapZone: [
        makeSpellTrapCard({
          cardId: "trap_1",
          definitionId: "trap_1",
          faceDown: true,
        }),
      ],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: true,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canSummon.size).toBe(0);
    expect(result.canSetMonster.size).toBe(0);
    expect(result.canSetSpellTrap.size).toBe(0);
    expect(result.canActivateSpell.size).toBe(0);
    expect(result.canActivateTrap.size).toBe(0);
    expect(result.canActivateEffect.size).toBe(0);
    expect(result.canAttack.size).toBe(0);
    expect(result.canFlipSummon.size).toBe(0);
    expect(result.canChangePosition.size).toBe(0);
  });
});

describe("deriveValidActions: basic own-turn actions", () => {
  it("canSummon populated for stereotype in hand during main phase", () => {
    const view = makeView({
      hand: ["monster_1"],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canSummon.has("monster_1")).toBe(true);
    const summonInfo = result.canSummon.get("monster_1")!;
    expect(summonInfo.positions).toContain("attack");
    expect(summonInfo.positions).toContain("defense");
  });

  it("canSetSpellTrap and canActivateSpell for spell in hand", () => {
    const view = makeView({
      hand: ["spell_1"],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canSetSpellTrap.has("spell_1")).toBe(true);
    expect(result.canActivateSpell.has("spell_1")).toBe(true);
  });

  it("canSetSpellTrap for trap in hand (but not canActivateTrap)", () => {
    const view = makeView({
      hand: ["trap_1"],
    });

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canSetSpellTrap.has("trap_1")).toBe(true);
    // Traps from hand can only be set, not activated directly
    expect(result.canActivateTrap.has("trap_1")).toBe(false);
  });
});
