import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import type { api } from "../component/_generated/api.js";

type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};
type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};

export type { RunQueryCtx, RunMutationCtx };

// Re-export the component API type for UseApi
export type { api };

/**
 * Client for the @lunchtable/cards Convex component.
 *
 * Usage:
 * ```ts
 * import { components } from "@convex/_generated/api";
 * import { LTCGCards } from "@lunchtable/cards/client";
 *
 * const cards = new LTCGCards(components.ltcgCards);
 *
 * export const myMutation = mutation({
 *   handler: async (ctx) => {
 *     await cards.cards.getAllCards(ctx);
 *   }
 * });
 * ```
 */
export class LTCGCards {
  public cards: CardsClient;
  public decks: DecksClient;
  public seeds: SeedsClient;

  constructor(component: typeof api) {
    this.cards = new CardsClient(component);
    this.decks = new DecksClient(component);
    this.seeds = new SeedsClient(component);
  }
}

/**
 * Client for card definition and inventory operations.
 */
export class CardsClient {
  constructor(private component: typeof api) {}

  async getAllCards(ctx: RunQueryCtx) {
    return await ctx.runQuery(this.component.cards.getAllCards, {});
  }

  async getCard(ctx: RunQueryCtx, cardId: string) {
    return await ctx.runQuery(this.component.cards.getCard, {
      cardId: cardId as any,
    });
  }

  async getCardsBatch(ctx: RunQueryCtx, cardIds: string[]) {
    return await ctx.runQuery(this.component.cards.getCardsBatch, {
      cardIds,
    });
  }

  async getUserCards(ctx: RunQueryCtx, userId: string) {
    return await ctx.runQuery(this.component.cards.getUserCards, {
      userId,
    });
  }

  async getUserFavoriteCards(ctx: RunQueryCtx, userId: string) {
    return await ctx.runQuery(this.component.cards.getUserFavoriteCards, {
      userId,
    });
  }

  async getCollectionStats(ctx: RunQueryCtx, userId: string) {
    return await ctx.runQuery(this.component.cards.getCollectionStats, {
      userId,
    });
  }

  async createCardDefinition(
    ctx: RunMutationCtx,
    card: {
      name: string;
      rarity: string;
      archetype: string;
      cardType: string;
      attack?: number;
      defense?: number;
      cost: number;
      level?: number;
      attribute?: string;
      spellType?: string;
      trapType?: string;
      ability?: any;
      flavorText?: string;
      imageUrl?: string;
    }
  ) {
    return await ctx.runMutation(
      this.component.cards.createCardDefinition,
      card
    );
  }

  async updateCardDefinition(
    ctx: RunMutationCtx,
    cardId: string,
    updates: {
      name?: string;
      rarity?: string;
      archetype?: string;
      cardType?: string;
      attack?: number;
      defense?: number;
      cost?: number;
      level?: number;
      attribute?: string;
      spellType?: string;
      trapType?: string;
      ability?: any;
      flavorText?: string;
      imageUrl?: string;
    }
  ) {
    return await ctx.runMutation(this.component.cards.updateCardDefinition, {
      cardId: cardId as any,
      ...updates,
    });
  }

  async toggleCardActive(ctx: RunMutationCtx, cardId: string) {
    return await ctx.runMutation(this.component.cards.toggleCardActive, {
      cardId: cardId as any,
    });
  }

  async addCardsToInventory(
    ctx: RunMutationCtx,
    args: {
      userId: string;
      cardDefinitionId: string;
      quantity: number;
      variant?: string;
      source?: string;
      serialNumber?: number;
    }
  ) {
    return await ctx.runMutation(this.component.cards.addCardsToInventory, {
      ...args,
      cardDefinitionId: args.cardDefinitionId as any,
      variant: args.variant as any,
    });
  }

  async removeCardsFromInventory(
    ctx: RunMutationCtx,
    args: {
      userId: string;
      cardDefinitionId: string;
      quantity: number;
    }
  ) {
    return await ctx.runMutation(
      this.component.cards.removeCardsFromInventory,
      {
        ...args,
        cardDefinitionId: args.cardDefinitionId as any,
      }
    );
  }

  async toggleFavorite(
    ctx: RunMutationCtx,
    userId: string,
    playerCardId: string
  ) {
    return await ctx.runMutation(this.component.cards.toggleFavorite, {
      userId,
      playerCardId: playerCardId as any,
    });
  }
}

/**
 * Client for deck management operations.
 */
export class DecksClient {
  constructor(private component: typeof api) {}

  async getUserDecks(ctx: RunQueryCtx, userId: string) {
    return await ctx.runQuery(this.component.decks.getUserDecks, {
      userId,
    });
  }

  async getDeckWithCards(ctx: RunQueryCtx, deckId: string) {
    return await ctx.runQuery(this.component.decks.getDeckWithCards, {
      deckId: deckId as any,
    });
  }

  async getDeckStats(ctx: RunQueryCtx, deckId: string) {
    return await ctx.runQuery(this.component.decks.getDeckStats, {
      deckId: deckId as any,
    });
  }

  async validateDeck(
    ctx: RunQueryCtx,
    deckId: string,
    rules?: {
      minSize?: number;
      maxSize?: number;
      maxCopies?: number;
      maxLegendaryCopies?: number;
    }
  ) {
    return await ctx.runQuery(this.component.decks.validateDeck, {
      deckId: deckId as any,
      ...rules,
    });
  }

  async createDeck(
    ctx: RunMutationCtx,
    userId: string,
    name: string,
    opts?: {
      description?: string;
      deckArchetype?: string;
      maxDecks?: number;
    }
  ) {
    return await ctx.runMutation(this.component.decks.createDeck, {
      userId,
      name,
      ...opts,
    });
  }

  async saveDeck(
    ctx: RunMutationCtx,
    deckId: string,
    cards: { cardDefinitionId: string; quantity: number }[],
    rules?: {
      minSize?: number;
      maxSize?: number;
      maxCopies?: number;
      maxLegendaryCopies?: number;
    }
  ) {
    return await ctx.runMutation(this.component.decks.saveDeck, {
      deckId: deckId as any,
      cards: cards.map((c) => ({
        cardDefinitionId: c.cardDefinitionId as any,
        quantity: c.quantity,
      })),
      ...rules,
    });
  }

  async renameDeck(ctx: RunMutationCtx, deckId: string, name: string) {
    return await ctx.runMutation(this.component.decks.renameDeck, {
      deckId: deckId as any,
      name,
    });
  }

  async deleteDeck(ctx: RunMutationCtx, deckId: string) {
    return await ctx.runMutation(this.component.decks.deleteDeck, {
      deckId: deckId as any,
    });
  }

  async duplicateDeck(
    ctx: RunMutationCtx,
    deckId: string,
    name: string,
    opts?: {
      maxDecks?: number;
    }
  ) {
    return await ctx.runMutation(this.component.decks.duplicateDeck, {
      deckId: deckId as any,
      name,
      ...opts,
    });
  }

  async setActiveDeck(
    ctx: RunMutationCtx,
    userId: string,
    deckId: string,
    rules?: {
      minSize?: number;
      maxSize?: number;
      maxCopies?: number;
      maxLegendaryCopies?: number;
    }
  ) {
    return await ctx.runMutation(this.component.decks.setActiveDeck, {
      userId,
      deckId: deckId as any,
      ...rules,
    });
  }

  async selectStarterDeck(
    ctx: RunMutationCtx,
    userId: string,
    deckCode: string,
    starterCards: any[]
  ) {
    return await ctx.runMutation(this.component.decks.selectStarterDeck, {
      userId,
      deckCode,
      starterCards,
    });
  }
}

/**
 * Client for seeding card definitions and starter decks.
 */
export class SeedsClient {
  constructor(private component: typeof api) {}

  async seedCardDefinitions(ctx: RunMutationCtx, cards: any[]) {
    return await ctx.runMutation(
      this.component.seeds.seedCardDefinitions,
      { cards }
    );
  }

  async seedStarterDecks(ctx: RunMutationCtx, decks: any[]) {
    return await ctx.runMutation(
      this.component.seeds.seedStarterDecks,
      { decks }
    );
  }
}
