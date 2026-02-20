import { LTCGCards } from "@lunchtable/cards";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUser } from "./auth";

const cards: any = new LTCGCards(components.lunchtable_tcg_cards as any);

const deckRulesValidator = v.object({
  minSize: v.optional(v.number()),
  maxSize: v.optional(v.number()),
  maxCopies: v.optional(v.number()),
  maxLegendaryCopies: v.optional(v.number()),
});

const deckCardEntryValidator = v.object({
  cardDefinitionId: v.string(),
  quantity: v.number(),
});

async function assertDeckOwnedByUser(ctx: any, userId: string, deckId: string) {
  const decks = await cards.decks.getUserDecks(ctx, userId);
  const ownsDeck = Array.isArray(decks)
    ? decks.some((deck: any) => deck?.deckId === deckId)
    : false;

  if (!ownsDeck) {
    throw new Error("Deck not found or not owned by user");
  }
}

// ---------------------------------------------------------------------------
// Public card + deck queries
// ---------------------------------------------------------------------------

export const getAllCards = query({
  args: {},
  handler: async (ctx) => cards.cards.getAllCards(ctx),
});

export const getCard = query({
  args: { cardId: v.string() },
  handler: async (ctx, args) => cards.cards.getCard(ctx, args.cardId),
});

export const getCardsBatch = query({
  args: { cardIds: v.array(v.string()) },
  handler: async (ctx, args) => cards.cards.getCardsBatch(ctx, args.cardIds),
});

export const getUserCards = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return cards.cards.getUserCards(ctx, user._id);
  },
});

export const getUserFavoriteCards = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return cards.cards.getUserFavoriteCards(ctx, user._id);
  },
});

export const getCollectionStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return cards.cards.getCollectionStats(ctx, user._id);
  },
});

export const getUserDecks = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return cards.decks.getUserDecks(ctx, user._id);
  },
});

export const getDeckWithCards = query({
  args: { deckId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertDeckOwnedByUser(ctx, user._id, args.deckId);
    return cards.decks.getDeckWithCards(ctx, args.deckId);
  },
});

export const getDeckStats = query({
  args: { deckId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertDeckOwnedByUser(ctx, user._id, args.deckId);
    return cards.decks.getDeckStats(ctx, args.deckId);
  },
});

export const validateDeck = query({
  args: {
    deckId: v.string(),
    rules: v.optional(deckRulesValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertDeckOwnedByUser(ctx, user._id, args.deckId);
    return cards.decks.validateDeck(ctx, args.deckId, args.rules ?? undefined);
  },
});

// ---------------------------------------------------------------------------
// Public deck + collection mutations
// ---------------------------------------------------------------------------

export const createDeck = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    deckArchetype: v.optional(v.string()),
    maxDecks: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return cards.decks.createDeck(ctx, user._id, args.name, {
      description: args.description,
      deckArchetype: args.deckArchetype,
      maxDecks: args.maxDecks,
    });
  },
});

export const saveDeck = mutation({
  args: {
    deckId: v.string(),
    cards: v.array(deckCardEntryValidator),
    rules: v.optional(deckRulesValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertDeckOwnedByUser(ctx, user._id, args.deckId);
    return cards.decks.saveDeck(
      ctx,
      args.deckId,
      args.cards,
      args.rules ?? undefined,
    );
  },
});

export const renameDeck = mutation({
  args: { deckId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertDeckOwnedByUser(ctx, user._id, args.deckId);
    return cards.decks.renameDeck(ctx, args.deckId, args.name);
  },
});

export const deleteDeck = mutation({
  args: { deckId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertDeckOwnedByUser(ctx, user._id, args.deckId);
    return cards.decks.deleteDeck(ctx, args.deckId);
  },
});

export const duplicateDeck = mutation({
  args: {
    deckId: v.string(),
    name: v.string(),
    maxDecks: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertDeckOwnedByUser(ctx, user._id, args.deckId);
    return cards.decks.duplicateDeck(ctx, args.deckId, args.name, {
      maxDecks: args.maxDecks,
    });
  },
});

export const setActiveDeck = mutation({
  args: {
    deckId: v.string(),
    rules: v.optional(deckRulesValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertDeckOwnedByUser(ctx, user._id, args.deckId);
    return cards.decks.setActiveDeck(
      ctx,
      user._id,
      args.deckId,
      args.rules ?? undefined,
    );
  },
});

export const selectStarterDeck = mutation({
  args: {
    deckCode: v.string(),
    starterCards: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return cards.decks.selectStarterDeck(
      ctx,
      user._id,
      args.deckCode,
      args.starterCards,
    );
  },
});

export const toggleFavorite = mutation({
  args: { playerCardId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return cards.cards.toggleFavorite(ctx, user._id, args.playerCardId);
  },
});

// ---------------------------------------------------------------------------
// Internal admin / seed wrappers for full component surface coverage
// ---------------------------------------------------------------------------

export const adminCreateCardDefinition = internalMutation({
  args: { card: v.any() },
  handler: async (ctx, args) => cards.cards.createCardDefinition(ctx, args.card),
});

export const adminUpdateCardDefinition = internalMutation({
  args: { cardId: v.string(), updates: v.any() },
  handler: async (ctx, args) =>
    cards.cards.updateCardDefinition(ctx, args.cardId, args.updates),
});

export const adminToggleCardActive = internalMutation({
  args: { cardId: v.string() },
  handler: async (ctx, args) => cards.cards.toggleCardActive(ctx, args.cardId),
});

export const adminAddCardsToInventory = internalMutation({
  args: {
    userId: v.string(),
    cardDefinitionId: v.string(),
    quantity: v.number(),
    variant: v.optional(v.string()),
    source: v.optional(v.string()),
    serialNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => cards.cards.addCardsToInventory(ctx, args),
});

export const adminRemoveCardsFromInventory = internalMutation({
  args: {
    userId: v.string(),
    cardDefinitionId: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, args) => cards.cards.removeCardsFromInventory(ctx, args),
});

export const seedCardDefinitions = internalMutation({
  args: { cards: v.array(v.any()) },
  handler: async (ctx, args) => cards.seeds.seedCardDefinitions(ctx, args.cards),
});

export const seedStarterDecks = internalMutation({
  args: { decks: v.array(v.any()) },
  handler: async (ctx, args) => cards.seeds.seedStarterDecks(ctx, args.decks),
});
