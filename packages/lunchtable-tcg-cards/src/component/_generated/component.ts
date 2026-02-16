/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    cards: {
      addCardsToInventory: FunctionReference<
        "mutation",
        "internal",
        {
          cardDefinitionId: string;
          quantity: number;
          serialNumber?: number;
          source?: string;
          userId: string;
          variant?: "standard" | "foil" | "alt_art" | "full_art" | "numbered";
        },
        { newQuantity: number; success: boolean },
        Name
      >;
      createCardDefinition: FunctionReference<
        "mutation",
        "internal",
        {
          ability?: any;
          archetype: string;
          attack?: number;
          attribute?: string;
          cardType: string;
          cost: number;
          defense?: number;
          flavorText?: string;
          imageUrl?: string;
          isActive?: boolean;
          level?: number;
          name: string;
          rarity: string;
          spellType?: string;
          trapType?: string;
        },
        string,
        Name
      >;
      getAllCards: FunctionReference<"query", "internal", {}, any, Name>;
      getCard: FunctionReference<
        "query",
        "internal",
        { cardId: string },
        any,
        Name
      >;
      getCardsBatch: FunctionReference<
        "query",
        "internal",
        { cardIds: Array<string> },
        any,
        Name
      >;
      getCollectionStats: FunctionReference<
        "query",
        "internal",
        { userId: string },
        { favoriteCount: number; totalCards: number; uniqueCards: number },
        Name
      >;
      getUserCards: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any,
        Name
      >;
      getUserFavoriteCards: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any,
        Name
      >;
      removeCardsFromInventory: FunctionReference<
        "mutation",
        "internal",
        { cardDefinitionId: string; quantity: number; userId: string },
        { remainingQuantity: number; success: boolean },
        Name
      >;
      toggleCardActive: FunctionReference<
        "mutation",
        "internal",
        { cardId: string },
        { isActive: boolean },
        Name
      >;
      toggleFavorite: FunctionReference<
        "mutation",
        "internal",
        { playerCardId: string; userId: string },
        { isFavorite: boolean },
        Name
      >;
      updateCardDefinition: FunctionReference<
        "mutation",
        "internal",
        {
          ability?: any;
          archetype?: string;
          attack?: number;
          attribute?: string;
          cardId: string;
          cardType?: string;
          cost?: number;
          defense?: number;
          flavorText?: string;
          imageUrl?: string;
          isActive?: boolean;
          level?: number;
          name?: string;
          rarity?: string;
          spellType?: string;
          trapType?: string;
        },
        { success: boolean },
        Name
      >;
    };
    decks: {
      createDeck: FunctionReference<
        "mutation",
        "internal",
        {
          deckArchetype?: string;
          description?: string;
          maxDecks?: number;
          name: string;
          userId: string;
        },
        string,
        Name
      >;
      deleteDeck: FunctionReference<
        "mutation",
        "internal",
        { deckId: string },
        any,
        Name
      >;
      duplicateDeck: FunctionReference<
        "mutation",
        "internal",
        { deckId: string; maxDecks?: number; name: string },
        string,
        Name
      >;
      getDeckStats: FunctionReference<
        "query",
        "internal",
        { deckId: string },
        {
          averageCost: number;
          cardsByRarity: {
            common: number;
            epic: number;
            legendary: number;
            rare: number;
            uncommon: number;
          };
          cardsByType: {
            class: number;
            spell: number;
            stereotype: number;
            trap: number;
          };
          totalCards: number;
        },
        Name
      >;
      getDeckWithCards: FunctionReference<
        "query",
        "internal",
        { deckId: string },
        any,
        Name
      >;
      getUserDecks: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          cardCount: number;
          createdAt: number;
          deckArchetype?: string;
          deckId: string;
          description?: string;
          name: string;
          updatedAt: number;
        }>,
        Name
      >;
      renameDeck: FunctionReference<
        "mutation",
        "internal",
        { deckId: string; name: string },
        any,
        Name
      >;
      saveDeck: FunctionReference<
        "mutation",
        "internal",
        {
          cards: Array<{ cardDefinitionId: string; quantity: number }>;
          deckId: string;
          maxCopies?: number;
          maxLegendaryCopies?: number;
          maxSize?: number;
          minSize?: number;
        },
        any,
        Name
      >;
      selectStarterDeck: FunctionReference<
        "mutation",
        "internal",
        {
          deckCode: string;
          starterCards: Array<{
            ability?: any;
            archetype: string;
            attack?: number;
            attribute?: string;
            cardType: string;
            cost: number;
            defense?: number;
            flavorText?: string;
            imageUrl?: string;
            level?: number;
            name: string;
            rarity: string;
            spellType?: string;
            trapType?: string;
          }>;
          userId: string;
        },
        { cardsReceived: number; deckId: string; deckSize: number },
        Name
      >;
      setActiveDeck: FunctionReference<
        "mutation",
        "internal",
        {
          deckId: string;
          maxCopies?: number;
          maxLegendaryCopies?: number;
          maxSize?: number;
          minSize?: number;
          userId: string;
        },
        string,
        Name
      >;
      validateDeck: FunctionReference<
        "query",
        "internal",
        {
          deckId: string;
          maxCopies?: number;
          maxLegendaryCopies?: number;
          maxSize?: number;
          minSize?: number;
        },
        {
          errors: Array<string>;
          isValid: boolean;
          totalCards: number;
          warnings: Array<string>;
        },
        Name
      >;
    };
    seeds: {
      seedCardDefinitions: FunctionReference<
        "mutation",
        "internal",
        {
          cards: Array<{
            ability?: any;
            archetype: string;
            attack?: number;
            attribute?: string;
            breakdownEffect?: any;
            breakdownFlavorText?: string;
            cardType: string;
            cost: number;
            defense?: number;
            flavorText?: string;
            imageUrl?: string;
            level?: number;
            name: string;
            rarity: string;
            spellType?: string;
            trapType?: string;
            viceType?: string;
          }>;
        },
        { created: number; skipped: number },
        Name
      >;
      seedStarterDecks: FunctionReference<
        "mutation",
        "internal",
        {
          decks: Array<{
            archetype: string;
            cardCount: number;
            deckCode: string;
            description: string;
            name: string;
            playstyle: string;
          }>;
        },
        { created: number; skipped: number },
        Name
      >;
    };
  };
