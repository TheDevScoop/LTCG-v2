import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { LTCGCards } from "@lunchtable/cards";
import { LTCGMatch } from "@lunchtable/match";
import { createInitialState, DEFAULT_CONFIG, buildCardLookup } from "@lunchtable/engine";
import { buildDeckFingerprint, buildMatchSeed, makeRng } from "./agentSeed";
import { DECK_RECIPES } from "./cardData";
import {
  buildAIDeck,
  assertStoryStageUnlocked,
  getDeckCardIdsFromDeckData,
  resolveActiveDeckForStory,
} from "./game";

const cards = new LTCGCards(components.lunchtable_tcg_cards as any);
const match = new LTCGMatch(components.lunchtable_tcg_match as any);

const vBattleStartResult = v.object({
  matchId: v.string(),
  chapterId: v.string(),
  stageNumber: v.number(),
});

const vAgentPvpCreateResult = v.object({
  matchId: v.string(),
  visibility: v.literal("public"),
  joinCode: v.null(),
  status: v.literal("waiting"),
  createdAt: v.number(),
});

// ── Agent Queries ─────────────────────────────────────────────────

export const getAgentByKeyHash = query({
  args: { apiKeyHash: v.string() },
  returns: v.union(v.any(), v.null()),
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
  returns: v.object({
    agentId: v.id("agents"),
    userId: v.id("users"),
  }),
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
  returns: vBattleStartResult,
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.agentUserId);
    if (!user) throw new ConvexError("Agent user not found");
    const stageNum = args.stageNumber ?? 1;
    const { stage } = await assertStoryStageUnlocked(
      ctx,
      user._id,
      args.chapterId,
      stageNum,
    );

    const { deckData } = await resolveActiveDeckForStory(ctx, user);

    const playerDeck = getDeckCardIdsFromDeckData(deckData);
    if (playerDeck.length < 30) throw new ConvexError("Deck must have at least 30 cards");

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
    if (finalAiDeck.length < 30) {
      throw new ConvexError("Built-in CPU opponent deck failed to initialize.");
    }

    const cardLookup = buildCardLookup(allCards as any);
    const seed = buildMatchSeed([
      "agentStartBattle",
      "mode:story",
      user._id,
      "cpu",
      args.chapterId,
      stageNum,
      `playerDeck:${buildDeckFingerprint(playerDeck)}`,
      `cpuDeck:${buildDeckFingerprint(finalAiDeck)}`,
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

export const agentCreatePvpLobby = mutation({
  args: {
    agentUserId: v.id("users"),
  },
  returns: vAgentPvpCreateResult,
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.agentUserId);
    if (!user) throw new ConvexError("Agent user not found");

    const existing = await ctx.db
      .query("pvpLobbies")
      .withIndex("by_hostUserId", (q) => q.eq("hostUserId", user._id))
      .collect();
    if (existing.some((row: any) => row.status === "waiting")) {
      throw new ConvexError("You already have a waiting PvP lobby. Join or cancel it first.");
    }

    const { deckData } = await resolveActiveDeckForStory(ctx, user);
    const hostDeck = getDeckCardIdsFromDeckData(deckData);
    if (hostDeck.length < 30) {
      throw new ConvexError("Deck must have at least 30 cards.");
    }

    const now = Date.now();
    const matchId = await match.createMatch(ctx, {
      hostId: user._id,
      mode: "pvp",
      hostDeck,
      isAIOpponent: false,
    });

    await ctx.db.insert("pvpLobbies", {
      matchId,
      mode: "pvp",
      hostUserId: user._id,
      hostUsername:
        typeof (user as any).username === "string" && (user as any).username.trim()
          ? String((user as any).username)
          : "Agent",
      visibility: "public",
      status: "waiting",
      createdAt: now,
      pongEnabled: false,
      redemptionEnabled: false,
    });

    return {
      matchId: String(matchId),
      visibility: "public" as const,
      joinCode: null,
      status: "waiting" as const,
      createdAt: now,
    };
  },
});

export const agentStartDuel = mutation({
  args: {
    agentUserId: v.id("users"),
  },
  returns: v.object({ matchId: v.string() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.agentUserId);
    if (!user) throw new ConvexError("Agent user not found");
    const { deckData } = await resolveActiveDeckForStory(ctx, user);

    const playerDeck = getDeckCardIdsFromDeckData(deckData);
    if (playerDeck.length < 30) throw new ConvexError("Deck must have at least 30 cards");

    const allCards = await cards.cards.getAllCards(ctx);
    const aiDeck = buildAIDeck(allCards);
    const cardLookup = buildCardLookup(allCards as any);
    const seed = buildMatchSeed([
      "agentStartDuel",
      "mode:pvp",
      user._id,
      "cpu",
      `playerDeck:${buildDeckFingerprint(playerDeck)}`,
      `cpuDeck:${buildDeckFingerprint(aiDeck)}`,
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
    mode: v.literal("pvp"),
    seat: v.literal("away"),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.agentUserId);
    if (!user) throw new Error("Agent user not found");
    const agentUserId = String(args.agentUserId);

    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if (!meta) throw new Error("Match not found");

    if ((meta as any).mode !== "pvp") {
      throw new Error(
        "Story matches are CPU-only for agent API. Use /api/agent/game/start to play story mode.",
      );
    }
    const hasCpuOpponent =
      (meta as any).hostId === "cpu" || (meta as any).awayId === "cpu";
    if (hasCpuOpponent) {
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

    const seed = buildMatchSeed([
      "agentJoinMatch",
      "mode:pvp",
      hostId,
      agentUserId,
      `hostDeck:${buildDeckFingerprint(hostDeck)}`,
      `awayDeck:${buildDeckFingerprint(awayDeck)}`,
    ]);
    const firstPlayer: "host" | "away" = seed % 2 === 0 ? "host" : "away";

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

    const lobby = await ctx.db
      .query("pvpLobbies")
      .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
      .first();

    await match.startMatch(ctx, {
      matchId: args.matchId,
      initialState: JSON.stringify(initialState),
      configAllowlist: lobby
        ? {
            pongEnabled: lobby.pongEnabled === true,
            redemptionEnabled: lobby.redemptionEnabled === true,
          }
        : undefined,
    });

    if (lobby && lobby.status === "waiting") {
      await ctx.db.patch(lobby._id, {
        status: "active",
        activatedAt: Date.now(),
      });
    }

    return {
      matchId: args.matchId,
      hostId: String(hostId),
      mode: "pvp" as const,
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
  returns: v.object({
    deckId: v.string(),
    cardCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.agentUserId);
    if (!user) throw new ConvexError("Agent user not found");

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
    if (!recipe) throw new ConvexError(`Unknown deck code: ${args.deckCode}`);

    const allCards = await cards.cards.getAllCards(ctx);
    const byName = new Map<string, any>();
    for (const c of allCards ?? []) byName.set(c.name, c);

    const resolvedCards: { cardDefinitionId: string; quantity: number }[] = [];
    for (const entry of recipe) {
      const cardDef = byName.get(entry.cardName);
      if (!cardDef) throw new ConvexError(`Card not found: "${entry.cardName}"`);
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
