import { describe, expect, it } from "vitest";
import { parseCSVAbilities } from "@lunchtable/engine";
import { CARD_DEFINITIONS } from "../cardData";

/**
 * Tests the getAllCards enrichment pipeline — the logic in convex/game.ts
 * that adds parsed `effects[]` to raw card definitions before sending them
 * to the frontend.
 *
 * These tests catch real issues:
 * 1. Effect ID collisions between cards (would break OPT tracking)
 * 2. Cards with no abilities crashing the enrichment loop
 * 3. Effect count mismatches between raw abilities and parsed effects
 * 4. Missing descriptions making the UI show blank text
 * 5. Enrichment working correctly on actual game card data (not just mocks)
 */

// ── Enrichment logic (mirrors convex/game.ts getAllCards handler) ─────

function enrichCard(card: any) {
  const effects = parseCSVAbilities(card.ability);
  if (effects) {
    for (const eff of effects) {
      eff.id = `${card._id ?? card.name}:${eff.id}`;
    }
  }
  return { ...card, effects };
}

function enrichAllCards(cards: any[]) {
  return cards.map(enrichCard);
}

// ── Core enrichment tests ────────────────────────────────────────────

describe("getAllCards enrichment pipeline", () => {
  it("enriches cards with parsed effects", () => {
    const card = {
      _id: "card_1",
      name: "Test Monster",
      cardType: "stereotype",
      ability: [
        {
          trigger: "OnSummon",
          speed: 1,
          targets: ["self"],
          operations: ["DRAW: 1"],
        },
      ],
    };

    const enriched = enrichCard(card);
    expect(enriched.effects).toBeDefined();
    expect(enriched.effects).toHaveLength(1);
    expect(enriched.effects[0].type).toBe("on_summon");
    expect(enriched.effects[0].actions[0].type).toBe("draw");
  });

  it("cards without abilities get effects=undefined (no crash)", () => {
    const card = {
      _id: "card_no_ability",
      name: "Vanilla Monster",
      cardType: "stereotype",
    };

    const enriched = enrichCard(card);
    expect(enriched.effects).toBeUndefined();
    // Original fields preserved
    expect(enriched.name).toBe("Vanilla Monster");
    expect(enriched._id).toBe("card_no_ability");
  });

  it("cards with empty ability array get effects=undefined", () => {
    const card = {
      _id: "card_empty",
      name: "Empty Ability",
      cardType: "stereotype",
      ability: [],
    };

    const enriched = enrichCard(card);
    expect(enriched.effects).toBeUndefined();
  });

  it("preserves all original card fields after enrichment", () => {
    const card = {
      _id: "card_full",
      name: "Full Card",
      cardType: "stereotype",
      attack: 1500,
      defense: 1200,
      level: 4,
      archetype: "dropouts",
      rarity: "rare",
      attribute: "Crypto",
      flavorText: "A degen at heart",
      ability: [
        {
          trigger: "OnSummon",
          speed: 1,
          targets: ["self"],
          operations: ["DRAW: 1"],
        },
      ],
    };

    const enriched = enrichCard(card);
    expect(enriched.name).toBe("Full Card");
    expect(enriched.attack).toBe(1500);
    expect(enriched.defense).toBe(1200);
    expect(enriched.level).toBe(4);
    expect(enriched.archetype).toBe("dropouts");
    expect(enriched.rarity).toBe("rare");
    expect(enriched.attribute).toBe("Crypto");
    expect(enriched.flavorText).toBe("A degen at heart");
    // AND has effects
    expect(enriched.effects).toBeDefined();
  });
});

// ── Effect ID collision prevention ───────────────────────────────────

describe("effect ID prefixing prevents OPT collisions", () => {
  it("same ability on two different cards gets different effect IDs", () => {
    const ability = [
      {
        trigger: "OnMainPhase",
        speed: "ignition",
        targets: ["self"],
        operations: ["DRAW: 1"],
      },
    ];

    const card1 = { _id: "card_A", name: "Card A", ability };
    const card2 = { _id: "card_B", name: "Card B", ability };

    const enriched1 = enrichCard(card1);
    const enriched2 = enrichCard(card2);

    expect(enriched1.effects![0].id).toBe("card_A:eff_0");
    expect(enriched2.effects![0].id).toBe("card_B:eff_0");
    expect(enriched1.effects![0].id).not.toBe(enriched2.effects![0].id);
  });

  it("multi-effect card gets unique IDs per effect", () => {
    const card = {
      _id: "card_multi",
      name: "Multi Effect",
      ability: [
        {
          trigger: "OnSummon",
          speed: 1,
          targets: ["self"],
          operations: ["DRAW: 1"],
        },
        {
          trigger: "OnMainPhase",
          speed: "ignition",
          targets: ["opponent"],
          operations: ["MODIFY_STAT: reputation -300"],
        },
      ],
    };

    const enriched = enrichCard(card);
    expect(enriched.effects).toHaveLength(2);
    expect(enriched.effects![0].id).toBe("card_multi:eff_0");
    expect(enriched.effects![1].id).toBe("card_multi:eff_1");
  });

  it("no two effects share the same ID in a batch of enriched cards", () => {
    const cards = [
      {
        _id: "c1",
        name: "Card 1",
        ability: [
          { trigger: "OnSummon", speed: 1, targets: ["self"], operations: ["DRAW: 1"] },
          { trigger: "OnMainPhase", speed: 1, targets: ["self"], operations: ["DRAW: 2"] },
        ],
      },
      {
        _id: "c2",
        name: "Card 2",
        ability: [
          { trigger: "OnSummon", speed: 1, targets: ["self"], operations: ["DRAW: 1"] },
        ],
      },
      {
        _id: "c3",
        name: "Card 3 (no ability)",
      },
    ];

    const enriched = enrichAllCards(cards);
    const allIds = enriched
      .flatMap((c) => c.effects ?? [])
      .map((e: any) => e.id);

    // All IDs unique
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toEqual(["c1:eff_0", "c1:eff_1", "c2:eff_0"]);
  });
});

// ── Real card data integration ───────────────────────────────────────

describe("enrichment on real CARD_DEFINITIONS", () => {
  const enrichedCards = CARD_DEFINITIONS.map((card, i) =>
    enrichCard({ ...card, _id: `card_${i}` })
  );

  it("processes all 132 cards without error", () => {
    expect(enrichedCards).toHaveLength(132);
  });

  it("every card has a name", () => {
    for (const card of enrichedCards) {
      expect(card.name).toBeTruthy();
    }
  });

  it("cards with abilities get effects with at least one action each", () => {
    const cardsWithEffects = enrichedCards.filter((c) => c.effects);
    expect(cardsWithEffects.length).toBeGreaterThan(0);

    for (const card of cardsWithEffects) {
      for (const effect of card.effects!) {
        expect(effect.actions.length).toBeGreaterThan(0);
        expect(effect.id).toBeTruthy();
        expect(effect.type).toBeTruthy();
        expect(effect.description).toBeTruthy();
      }
    }
  });

  it("no two effects across all cards share the same ID", () => {
    const allEffectIds = enrichedCards
      .flatMap((c) => c.effects ?? [])
      .map((e: any) => e.id);

    const uniqueIds = new Set(allEffectIds);
    expect(uniqueIds.size).toBe(allEffectIds.length);
  });

  it("every effect description is non-empty (UI won't show blank text)", () => {
    const allEffects = enrichedCards.flatMap((c) => c.effects ?? []);
    for (const effect of allEffects) {
      expect(effect.description.length).toBeGreaterThan(0);
    }
  });

  it("stereotype cards that have abilities all get parsed effects", () => {
    const stereotypes = CARD_DEFINITIONS.filter(
      (c) => c.cardType === "stereotype" && c.ability && c.ability.length > 0
    );
    const enrichedStereotypes = stereotypes.map((card, i) =>
      enrichCard({ ...card, _id: `st_${i}` })
    );

    for (const card of enrichedStereotypes) {
      // Every stereotype with abilities should have at least one parseable effect
      // (some abilities only have meta operations like SHUFFLE, but most have real effects)
      // This test catches if the parser silently fails on a whole class of cards
      if (card.effects === undefined) {
        // If no effects parsed, all operations must be meta-only
        const allOps = (card.ability ?? []).flatMap((a: any) => a.operations ?? []);
        const metaOnlyOps = [
          "MODIFY_COST:", "VIEW_TOP_CARDS:", "REARRANGE_CARDS",
          "REVEAL_HAND", "SHUFFLE", "ACTIVATE_TRAPS_TWICE", "REVERSE_EFFECT",
        ];
        for (const op of allOps) {
          const isMeta = metaOnlyOps.some((m) => op.trim().startsWith(m) || op.trim() === m);
          expect(isMeta).toBe(true);
        }
      }
    }
  });

  it("spell cards get correct effect types", () => {
    const spells = CARD_DEFINITIONS.filter((c) => c.cardType === "spell");
    expect(spells.length).toBeGreaterThan(0);

    const enrichedSpells = spells.map((card, i) =>
      enrichCard({ ...card, _id: `spell_${i}` })
    );

    for (const card of enrichedSpells) {
      if (card.effects) {
        for (const effect of card.effects) {
          // Spell effects should have valid types
          expect(["ignition", "trigger", "quick", "continuous", "flip", "on_summon"]).toContain(
            effect.type
          );
        }
      }
    }
  });

  it("trap cards get correct effect types", () => {
    const traps = CARD_DEFINITIONS.filter((c) => c.cardType === "trap");
    expect(traps.length).toBeGreaterThan(0);

    const enrichedTraps = traps.map((card, i) =>
      enrichCard({ ...card, _id: `trap_${i}` })
    );

    for (const card of enrichedTraps) {
      if (card.effects) {
        for (const effect of card.effects) {
          expect(["ignition", "trigger", "quick", "continuous", "flip", "on_summon"]).toContain(
            effect.type
          );
        }
      }
    }
  });
});

// ── Edge cases that would cause real UI bugs ─────────────────────────

describe("enrichment edge cases", () => {
  it("card with ability=null doesn't crash", () => {
    const card = { _id: "card_null", name: "Null Ability", ability: null };
    const enriched = enrichCard(card);
    expect(enriched.effects).toBeUndefined();
  });

  it("card with ability=undefined doesn't crash", () => {
    const card = { _id: "card_undef", name: "Undef Ability" };
    const enriched = enrichCard(card);
    expect(enriched.effects).toBeUndefined();
  });

  it("card with ability containing null entries doesn't crash", () => {
    const card = {
      _id: "card_sparse",
      name: "Sparse Ability",
      ability: [
        null,
        { trigger: "OnSummon", speed: 1, targets: ["self"], operations: ["DRAW: 1"] },
      ],
    };

    const enriched = enrichCard(card);
    expect(enriched.effects).toBeDefined();
    expect(enriched.effects).toHaveLength(1);
  });

  it("enrichment does not mutate the original card object", () => {
    const original = {
      _id: "card_orig",
      name: "Original",
      ability: [
        { trigger: "OnSummon", speed: 1, targets: ["self"], operations: ["DRAW: 1"] },
      ],
    };

    const originalCopy = JSON.parse(JSON.stringify(original));
    enrichCard(original);

    // The enrichment uses spread so original should be untouched
    expect(original).toEqual(originalCopy);
    expect((original as any).effects).toBeUndefined();
  });

  it("empty cards array doesn't crash enrichAllCards", () => {
    const result = enrichAllCards([]);
    expect(result).toEqual([]);
  });
});
