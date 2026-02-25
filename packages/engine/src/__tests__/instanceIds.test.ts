import { describe, expect, it } from "vitest";
import { createInitialState, decide, evolve } from "../engine.js";
import { DEFAULT_CONFIG } from "../types/config.js";
import type { CardDefinition } from "../types/cards.js";
import type { BoardCard, GameState } from "../types/state.js";

const MONSTER_DEF: CardDefinition = {
  id: "monster_def",
  name: "Monster",
  type: "stereotype",
  level: 4,
  attack: 1200,
  defense: 1000,
};

const DESTROY_SPELL_DEF: CardDefinition = {
  id: "destroy_spell_def",
  name: "Destroy Spell",
  type: "spell",
  spellType: "normal",
  effects: [
    {
      id: "destroy_selected",
      type: "ignition",
      description: "Destroy 1 target",
      targetCount: 1,
      targetFilter: {
        owner: "opponent",
        zone: "board",
        cardType: "stereotype",
      },
      actions: [{ type: "destroy", target: "selected" }],
    },
  ],
};

const RITUAL_SPELL_DEF: CardDefinition = {
  id: "ritual_spell_def",
  name: "Ritual Spell",
  type: "spell",
  spellType: "ritual",
};

const RITUAL_MONSTER_DEF: CardDefinition = {
  id: "ritual_monster_def",
  name: "Ritual Monster",
  type: "stereotype",
  level: 4,
  attack: 1800,
  defense: 1400,
};

const EQUIP_DEF: CardDefinition = {
  id: "equip_spell_def",
  name: "Equip Spell",
  type: "spell",
  spellType: "equip",
  effects: [
    {
      id: "equip_boost",
      type: "ignition",
      description: "Boost ATK",
      actions: [{ type: "boost_attack", amount: 200, duration: "permanent", target: "selected" }],
    },
  ],
};

const CARD_LOOKUP: Record<string, CardDefinition> = {
  monster_def: MONSTER_DEF,
  destroy_spell_def: DESTROY_SPELL_DEF,
  ritual_spell_def: RITUAL_SPELL_DEF,
  ritual_monster_def: RITUAL_MONSTER_DEF,
  equip_spell_def: EQUIP_DEF,
};

const makeBoardCard = (cardId: string, definitionId: string): BoardCard => ({
  cardId,
  definitionId,
  position: "attack",
  faceDown: false,
  canAttack: true,
  hasAttackedThisTurn: false,
  changedPositionThisTurn: false,
  viceCounters: 0,
  temporaryBoosts: { attack: 0, defense: 0 },
  equippedCards: [],
  turnSummoned: 1,
});

function findInstances(
  state: GameState,
  seat: "host" | "away",
  definitionId: string,
): string[] {
  const zoneIds = seat === "host"
    ? [...state.hostHand, ...state.hostDeck]
    : [...state.awayHand, ...state.awayDeck];
  return zoneIds.filter((instanceId) => state.instanceToDefinition[instanceId] === definitionId);
}

function removeFromZones(state: GameState, seat: "host" | "away", cardId: string): GameState {
  if (seat === "host") {
    return {
      ...state,
      hostHand: state.hostHand.filter((id) => id !== cardId),
      hostDeck: state.hostDeck.filter((id) => id !== cardId),
    };
  }
  return {
    ...state,
    awayHand: state.awayHand.filter((id) => id !== cardId),
    awayDeck: state.awayDeck.filter((id) => id !== cardId),
  };
}

describe("instance ids", () => {
  it("instanceIds_are_unique_per_copy_across_full_state", () => {
    const hostDeck = ["monster_def", "monster_def", "destroy_spell_def", "ritual_spell_def", "ritual_monster_def"];
    const awayDeck = ["monster_def", "monster_def", "equip_spell_def", "monster_def", "monster_def"];
    const state = createInitialState(
      CARD_LOOKUP,
      DEFAULT_CONFIG,
      "host",
      "away",
      hostDeck,
      awayDeck,
      "host",
      () => 0.5,
    );

    const ids = [
      ...state.hostHand,
      ...state.hostDeck,
      ...state.awayHand,
      ...state.awayDeck,
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const instanceId of ids) {
      expect(state.instanceToDefinition[instanceId]).toBeTruthy();
    }
  });

  it("destroy_selected_duplicate_only_removes_target_instance", () => {
    const base = createInitialState(
      CARD_LOOKUP,
      DEFAULT_CONFIG,
      "host",
      "away",
      ["destroy_spell_def", "monster_def", "monster_def", "monster_def", "monster_def"],
      ["monster_def", "monster_def", "monster_def", "monster_def", "monster_def"],
      "host",
      () => 0.5,
    );

    const destroySpell = findInstances(base, "host", "destroy_spell_def")[0]!;
    const duplicateMonsters = findInstances(base, "away", "monster_def").slice(0, 2);
    expect(duplicateMonsters.length).toBe(2);
    const [targetA, targetB] = duplicateMonsters;

    let state = base;
    state = removeFromZones(state, "host", destroySpell);
    state = removeFromZones(state, "away", targetA);
    state = removeFromZones(state, "away", targetB);
    state = {
      ...state,
      hostHand: [...state.hostHand, destroySpell],
      awayBoard: [
        makeBoardCard(targetA, "monster_def"),
        makeBoardCard(targetB, "monster_def"),
      ],
      currentPhase: "main",
      turnNumber: 2,
    };

    const events = decide(state, { type: "ACTIVATE_SPELL", cardId: destroySpell, targets: [targetA] }, "host");
    const nextState = evolve(state, events, { skipDerivedChecks: true });

    expect(nextState.awayBoard.map((card) => card.cardId)).toEqual([targetB]);
    expect(nextState.awayGraveyard).toContain(targetA);
    expect(nextState.awayGraveyard).not.toContain(targetB);
  });

  it("ritual_tribute_consumes_only_selected_instance", () => {
    const base = createInitialState(
      CARD_LOOKUP,
      DEFAULT_CONFIG,
      "host",
      "away",
      ["ritual_spell_def", "ritual_monster_def", "monster_def", "monster_def", "monster_def"],
      ["monster_def", "monster_def", "monster_def", "monster_def", "monster_def"],
      "host",
      () => 0.5,
    );

    const ritualSpell = findInstances(base, "host", "ritual_spell_def")[0]!;
    const ritualMonster = findInstances(base, "host", "ritual_monster_def")[0]!;
    const tributeCandidates = findInstances(base, "host", "monster_def").slice(0, 2);
    expect(tributeCandidates.length).toBe(2);
    const [tributeA, tributeB] = tributeCandidates;

    let state = base;
    state = removeFromZones(state, "host", ritualSpell);
    state = removeFromZones(state, "host", ritualMonster);
    state = removeFromZones(state, "host", tributeA);
    state = removeFromZones(state, "host", tributeB);
    state = {
      ...state,
      hostHand: [...state.hostHand, ritualSpell, ritualMonster],
      hostBoard: [
        makeBoardCard(tributeA, "monster_def"),
        makeBoardCard(tributeB, "monster_def"),
      ],
      currentPhase: "main",
      turnNumber: 2,
    };

    const events = decide(
      state,
      {
        type: "ACTIVATE_SPELL",
        cardId: ritualSpell,
        targets: [ritualMonster, tributeA],
      },
      "host",
    );
    const nextState = evolve(state, events, { skipDerivedChecks: true });

    expect(nextState.hostBoard.some((card) => card.cardId === tributeA)).toBe(false);
    expect(nextState.hostBoard.some((card) => card.cardId === tributeB)).toBe(true);
    expect(nextState.hostGraveyard).toContain(tributeA);
    expect(nextState.hostGraveyard).not.toContain(tributeB);
  });

  it("equip_destroy_removes_single_equip_instance", () => {
    const state: GameState = {
      ...createInitialState(
        CARD_LOOKUP,
        DEFAULT_CONFIG,
        "host",
        "away",
        ["monster_def", "monster_def", "monster_def", "monster_def", "monster_def"],
        ["monster_def", "monster_def", "monster_def", "monster_def", "monster_def"],
        "host",
        () => 0.5,
      ),
      hostBoard: [
        {
          ...makeBoardCard("host_monster_instance", "monster_def"),
          temporaryBoosts: { attack: 400, defense: 0 },
          equippedCards: ["equip_instance_a", "equip_instance_b"],
        },
      ],
      hostSpellTrapZone: [
        { cardId: "equip_instance_a", definitionId: "equip_spell_def", faceDown: false, activated: true },
        { cardId: "equip_instance_b", definitionId: "equip_spell_def", faceDown: false, activated: true },
      ],
      instanceToDefinition: {
        ...createInitialState(
          CARD_LOOKUP,
          DEFAULT_CONFIG,
          "host",
          "away",
          ["monster_def", "monster_def", "monster_def", "monster_def", "monster_def"],
          ["monster_def", "monster_def", "monster_def", "monster_def", "monster_def"],
          "host",
          () => 0.5,
        ).instanceToDefinition,
        host_monster_instance: "monster_def",
        equip_instance_a: "equip_spell_def",
        equip_instance_b: "equip_spell_def",
      },
    };

    const nextState = evolve(
      state,
      [{ type: "EQUIP_DESTROYED", cardId: "equip_instance_a", reason: "target_left" }],
      { skipDerivedChecks: true },
    );

    expect(nextState.hostSpellTrapZone.map((card) => card.cardId)).toEqual(["equip_instance_b"]);
    expect(nextState.hostGraveyard).toContain("equip_instance_a");
    expect(nextState.hostGraveyard).not.toContain("equip_instance_b");
    expect(nextState.hostBoard[0]?.equippedCards).toEqual(["equip_instance_b"]);
    expect(nextState.hostBoard[0]?.temporaryBoosts.attack).toBe(200);
  });

  it("special_summon_preserves_instance_definition_mapping", () => {
    const state = createInitialState(
      CARD_LOOKUP,
      DEFAULT_CONFIG,
      "host",
      "away",
      ["monster_def", "monster_def", "monster_def", "monster_def", "monster_def"],
      ["monster_def", "monster_def", "monster_def", "monster_def", "monster_def"],
      "host",
      () => 0.5,
    );

    const cardId = state.hostHand[0]!;
    const expectedDefinitionId = state.instanceToDefinition[cardId]!;
    expect(expectedDefinitionId).toBe("monster_def");

    const nextState = evolve(
      state,
      [
        {
          type: "SPECIAL_SUMMONED",
          seat: "host",
          cardId,
          from: "hand",
          position: "attack",
        },
      ],
      { skipDerivedChecks: true },
    );

    const summoned = nextState.hostBoard.find((card) => card.cardId === cardId);
    expect(summoned).toBeTruthy();
    expect(summoned?.definitionId).toBe(expectedDefinitionId);
    expect(nextState.cardLookup[summoned!.definitionId]?.id).toBe(expectedDefinitionId);
    expect(nextState.hostHand).not.toContain(cardId);
  });
});
