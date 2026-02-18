import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { LTCGCards } from "@lunchtable-tcg/cards";
import { LTCGMatch } from "@lunchtable-tcg/match";
import { createInitialState, DEFAULT_CONFIG, buildCardLookup } from "@lunchtable-tcg/engine";
import { DECK_RECIPES } from "./cardData";
import {
  buildAIDeck,
  assertStoryStageUnlocked,
  getDeckCardIdsFromDeckData,
  resolveActiveDeckForStory,
} from "./game";

const cards = new LTCGCards(components.lunchtable_tcg_cards as any);
const match = new LTCGMatch(components.lunchtable_tcg_match as any);

const buildDeterministicSeed = (seedInput: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < seedInput.length; i++) {
    hash ^= seedInput.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const makeRng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const buildMatchSeed = (parts: Array<string | number | null | undefined>): number => {
  const values = parts.map((value) => String(value ?? "")).join("|");
  return buildDeterministicSeed(values);
};

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
    const { stage } = await assertStoryStageUnlocked(
      ctx,
      user._id,
      args.chapterId,
      stageNum,
    );

    const { deckData } = await resolveActiveDeckForStory(ctx, user);

    const playerDeck = getDeckCardIdsFromDeckData(deckData);
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
    const seed = buildMatchSeed([
      "agentStartBattle",
      user._id,
      "cpu",
      args.chapterId,
      stageNum,
      playerDeck.length,
      finalAiDeck.length,
      playerDeck[0],
      finalAiDeck[0],
    ]);

    const initialState = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      user._id,
      "cpu",
      playerDeck,
      finalAiDeck,
      "host",
      makeRng(seed),
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

    const playerDeck = getDeckCardIdsFromDeckData(deckData);
    if (playerDeck.length < 30) throw new Error("Deck must have at least 30 cards");

    const allCards = await cards.cards.getAllCards(ctx);
    const aiDeck = buildAIDeck(allCards);
    const cardLookup = buildCardLookup(allCards as any);
    const seed = buildMatchSeed([
      "agentStartDuel",
      user._id,
      "cpu",
      playerDeck.length,
      aiDeck.length,
      playerDeck[0],
      aiDeck[0],
    ]);

    const initialState = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      user._id,
      "cpu",
      playerDeck,
      aiDeck,
      "host",
      makeRng(seed),
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

export const agentJoinMatch = mutation({
  args: {
    agentUserId: v.id("users"),
    matchId: v.string(),
  },
  returns: v.object({
    matchId: v.string(),
    hostId: v.string(),
    mode: v.union(v.literal("pvp"), v.literal("story")),
    seat: v.literal("away"),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.agentUserId);
    if (!user) throw new Error("Agent user not found");
    const agentUserId = String(args.agentUserId);

    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if (!meta) throw new Error("Match not found");

    if ((meta as any).isAIOpponent) {
      throw new Error("Cannot join a match configured for built-in CPU opponent.");
    }
    if ((meta as any).status !== "waiting") {
      throw new Error(`Match ${args.matchId} is not waiting (current status: ${(meta as any).status ?? "unknown"}).`);
    }
    if ((meta as any).awayId !== null) {
      throw new Error(`Match ${args.matchId} already has an away player.`);
    }

    const hostId = (meta as any).hostId;
    if (!hostId) {
      throw new Error("Match is missing a host player.");
    }
    if (hostId === agentUserId) {
      throw new Error("Cannot join your own match as away player.");
    }

    const hostDeck = (meta as any).hostDeck;
    if (!Array.isArray(hostDeck) || hostDeck.length < 30) {
      throw new Error("Host deck is invalid or too small.");
    }

    const { deckData } = await resolveActiveDeckForStory(ctx, user);
    const awayDeck = getDeckCardIdsFromDeckData(deckData);
    if (!Array.isArray(awayDeck) || awayDeck.length < 30) {
      throw new Error("Your deck must have at least 30 cards.");
    }

    const allCards = await cards.cards.getAllCards(ctx);
    const cardLookup = buildCardLookup(allCards as any);

    const firstPlayer: "host" | "away" = Math.random() < 0.5 ? "host" : "away";
    const seed = buildMatchSeed([
      "agentJoinMatch",
      hostId,
      agentUserId,
      firstPlayer,
      hostDeck.length,
      awayDeck.length,
      hostDeck[0],
      awayDeck[0],
    ]);

    const initialState = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      hostId,
      agentUserId,
      hostDeck,
      awayDeck,
      firstPlayer,
      makeRng(seed),
    );

    await match.joinMatch(ctx, {
      matchId: args.matchId,
      awayId: agentUserId,
      awayDeck,
    });

    await match.startMatch(ctx, {
      matchId: args.matchId,
      initialState: JSON.stringify(initialState),
    });

    const mode = (meta as any).mode as "pvp" | "story";
    return {
      matchId: args.matchId,
      hostId: String(hostId),
      mode,
      seat: "away" as const,
    };
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
      const requestedArchetype = args.deckCode.replace("_starter", "");
      const existingDeck =
        existingDecks.find((deck: any) => deck.name === args.deckCode) ??
        existingDecks.find((deck: any) => {
          const archetype = deck.deckArchetype;
          return (
            typeof archetype === "string" &&
            archetype.toLowerCase() === requestedArchetype.toLowerCase()
          );
        }) ??
        existingDecks[0];

      if (existingDeck?.deckId) {
        await cards.decks.setActiveDeck(ctx, user._id, existingDeck.deckId);
        if ((user as any).activeDeckId !== existingDeck.deckId) {
          await ctx.db.patch(user._id, { activeDeckId: existingDeck.deckId });
        }
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
