import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { LTCGCards } from "@lunchtable-tcg/cards";
import { LTCGMatch } from "@lunchtable-tcg/match";
import { LTCGStory } from "@lunchtable-tcg/story";
import { createInitialState, DEFAULT_CONFIG, buildCardLookup } from "@lunchtable-tcg/engine";
import { DECK_RECIPES } from "./cardData";
import { buildAIDeck } from "./game";
import {
  activateDeckForUser,
  resolveStarterDeck,
} from "./starterDeckHelpers";

const cards = new LTCGCards(components.lunchtable_tcg_cards as any);
const match = new LTCGMatch(components.lunchtable_tcg_match as any);
const story = new LTCGStory(components.lunchtable_tcg_story as any);

const RESERVED_DECK_IDS = new Set(["undefined", "null", "skip"]);
const normalizeDeckId = (deckId: string | undefined): string | null => {
  if (!deckId) return null;
  const trimmed = deckId.trim();
  if (!trimmed) return null;
  if (RESERVED_DECK_IDS.has(trimmed.toLowerCase())) return null;
  return trimmed;
};

async function resolveActiveDeckForStory(ctx: any, user: { _id: string; activeDeckId?: string }) {
  const requestedDeckId = normalizeDeckId(user.activeDeckId);

  const activeDecks = await cards.decks.getUserDecks(ctx, user._id);
  if (!activeDecks || activeDecks.length === 0) {
    throw new Error("No active deck set. Select a starter deck first.");
  }

  const preferredDeck =
    requestedDeckId
      ? activeDecks.find((deck: { deckId: string }) => deck.deckId === requestedDeckId)
      : null;

  const deckId = preferredDeck?.deckId ?? activeDecks[0]?.deckId;
  if (typeof deckId !== "string" || !deckId) {
    throw new Error("No valid active deck found.");
  }
  const deckData = await cards.decks.getDeckWithCards(ctx, deckId);
  if (!deckData) {
    throw new Error("Deck not found");
  }

  if (deckId !== user.activeDeckId) {
    await ctx.db.patch(user._id, { activeDeckId: deckId });
  }

  return { deckId, deckData };
}

// ── Agent Queries ─────────────────────────────────────────────────

export const getAgentByKeyHash = query({
  args: { apiKeyHash: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("agents")
      .withIndex("by_apiKeyHash", (q) => q.eq("apiKeyHash", args.apiKeyHash))
      .first();
  },
});

// ── Agent Registration ────────────────────────────────────────────

export const registerAgent = mutation({
  args: {
    name: v.string(),
    apiKeyHash: v.string(),
    apiKeyPrefix: v.string(),
  },
  handler: async (ctx, args) => {
    // Create a user record for the agent
    const userId = await ctx.db.insert("users", {
      privyId: `agent:${args.apiKeyHash.slice(0, 16)}`,
      username: `agent_${args.name.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 14)}`,
      createdAt: Date.now(),
    });

    const agentId = await ctx.db.insert("agents", {
      name: args.name,
      apiKeyHash: args.apiKeyHash,
      apiKeyPrefix: args.apiKeyPrefix,
      userId,
      isActive: true,
      createdAt: Date.now(),
    });

    return { agentId, userId };
  },
});

// ── Agent Game Actions ────────────────────────────────────────────

export const agentStartBattle = mutation({
  args: {
    agentUserId: v.id("users"),
    chapterId: v.string(),
    stageNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.agentUserId);
    if (!user) throw new Error("Agent user not found");
    const stageNum = args.stageNumber ?? 1;

    // Resolve stage to get stageId for progress tracking
    const stages = await story.stages.getStages(ctx, args.chapterId);
    const stage = (stages as any[])?.find(
      (s: any) => s.stageNumber === stageNum,
    );
    if (!stage) throw new Error(`Stage ${stageNum} not found in chapter`);

    const { deckData } = await resolveActiveDeckForStory(ctx, user);

    const playerDeck: string[] = [];
    for (const card of (deckData as any).cards ?? []) {
      for (let i = 0; i < (card.quantity ?? 1); i++) {
        playerDeck.push(card.cardDefinitionId);
      }
    }
    if (playerDeck.length < 30) throw new Error("Deck must have at least 30 cards");

    const allCards = await cards.cards.getAllCards(ctx);

    // Build AI deck
    const active = (allCards ?? []).filter((c: any) => c.isActive);
    const stereotypes = active.filter((c: any) => c.cardType === "stereotype");
    const spells = active.filter((c: any) => c.cardType === "spell");
    const traps = active.filter((c: any) => c.cardType === "trap");
    const aiDeck: string[] = [];
    for (const card of stereotypes.slice(0, 7)) {
      for (let i = 0; i < 3; i++) aiDeck.push(card._id);
    }
    for (const card of spells.slice(0, 6)) {
      for (let i = 0; i < 2; i++) aiDeck.push(card._id);
    }
    for (const card of traps.slice(0, 4)) {
      for (let i = 0; i < 2; i++) aiDeck.push(card._id);
    }
    while (aiDeck.length < 40 && active.length > 0) {
      const card = active[aiDeck.length % active.length];
      if (card) {
        aiDeck.push(card._id);
      }
    }
    const finalAiDeck = aiDeck.slice(0, 40);

    const cardLookup = buildCardLookup(allCards as any);

    const initialState = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      user._id,
      "cpu",
      playerDeck,
      finalAiDeck,
      "host",
    );

    const matchId = await match.createMatch(ctx, {
      hostId: user._id,
      awayId: "cpu",
      mode: "story",
      hostDeck: playerDeck,
      awayDeck: finalAiDeck,
      isAIOpponent: true,
    });

    await match.startMatch(ctx, {
      matchId,
      initialState: JSON.stringify(initialState),
    });

    // Link match to story context
    await ctx.db.insert("storyMatches", {
      matchId,
      userId: user._id,
      chapterId: args.chapterId,
      stageNumber: stageNum,
      stageId: stage._id,
    });

    return { matchId, chapterId: args.chapterId, stageNumber: stageNum };
  },
});

export const agentStartDuel = mutation({
  args: {
    agentUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.agentUserId);
    if (!user) throw new Error("Agent user not found");
    const { deckData } = await resolveActiveDeckForStory(ctx, user);

    const playerDeck: string[] = [];
    for (const card of (deckData as any).cards ?? []) {
      for (let i = 0; i < (card.quantity ?? 1); i++) {
        playerDeck.push(card.cardDefinitionId);
      }
    }
    if (playerDeck.length < 30) throw new Error("Deck must have at least 30 cards");

    const allCards = await cards.cards.getAllCards(ctx);
    const aiDeck = buildAIDeck(allCards);
    const cardLookup = buildCardLookup(allCards as any);

    const initialState = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      user._id,
      "cpu",
      playerDeck,
      aiDeck,
      "host",
    );

    const matchId = await match.createMatch(ctx, {
      hostId: user._id,
      awayId: "cpu",
      mode: "pvp",
      hostDeck: playerDeck,
      awayDeck: aiDeck,
      isAIOpponent: true,
    });

    await match.startMatch(ctx, {
      matchId,
      initialState: JSON.stringify(initialState),
    });

    return { matchId };
  },
});

// ── Agent Deck Selection ─────────────────────────────────────────

export const agentSelectStarterDeck = mutation({
  args: {
    agentUserId: v.id("users"),
    deckCode: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.agentUserId);
    if (!user) throw new Error("Agent user not found");

    const existingDecks = await cards.decks.getUserDecks(ctx, user._id);
    if (existingDecks && existingDecks.length > 0) {
      const existingDeck = resolveStarterDeck(existingDecks, args.deckCode);

      if (existingDeck?.deckId) {
        await activateDeckForUser(
          ctx,
          user._id,
          (user as any).activeDeckId,
          existingDeck.deckId,
          (dbCtx, userId, deckId) =>
            cards.decks.setActiveDeck(dbCtx, userId, deckId),
        );
        return {
          deckId: existingDeck.deckId,
          cardCount: existingDeck.cardCount ?? 0,
        };
      }
    }

    const recipe = DECK_RECIPES[args.deckCode];
    if (!recipe) throw new Error(`Unknown deck code: ${args.deckCode}`);

    const allCards = await cards.cards.getAllCards(ctx);
    const byName = new Map<string, any>();
    for (const c of allCards ?? []) byName.set(c.name, c);

    const resolvedCards: { cardDefinitionId: string; quantity: number }[] = [];
    for (const entry of recipe) {
      const cardDef = byName.get(entry.cardName);
      if (!cardDef) throw new Error(`Card not found: "${entry.cardName}"`);
      resolvedCards.push({ cardDefinitionId: cardDef._id, quantity: entry.copies });
    }

    for (const rc of resolvedCards) {
      await cards.cards.addCardsToInventory(ctx, {
        userId: user._id,
        cardDefinitionId: rc.cardDefinitionId,
        quantity: rc.quantity,
        source: "starter_deck",
      });
    }

    const archetype = args.deckCode.replace("_starter", "");
    const deckId = await cards.decks.createDeck(ctx, user._id, args.deckCode, {
      deckArchetype: archetype,
    });
    await cards.decks.saveDeck(ctx, deckId, resolvedCards);
    await cards.decks.setActiveDeck(ctx, user._id, deckId);
    await ctx.db.patch(user._id, { activeDeckId: deckId });

    const totalCards = resolvedCards.reduce((sum, c) => sum + c.quantity, 0);
    return { deckId, cardCount: totalCards };
  },
});
