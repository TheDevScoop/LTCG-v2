import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./auth";
import { LTCGCards } from "@lunchtable-tcg/cards";
import { LTCGMatch } from "@lunchtable-tcg/match";
import { LTCGStory } from "@lunchtable-tcg/story";
import { createInitialState, DEFAULT_CONFIG, buildCardLookup } from "@lunchtable-tcg/engine";
import type { Command } from "@lunchtable-tcg/engine";
import { DECK_RECIPES, STARTER_DECKS } from "./cardData";

const cards: any = new LTCGCards(components.lunchtable_tcg_cards as any);
const match: any = new LTCGMatch(components.lunchtable_tcg_match as any);
const story: any = new LTCGStory(components.lunchtable_tcg_story as any);
const vStarterDeckSelectionResult = v.object({
  deckId: v.string(),
  cardCount: v.number(),
});
const vStoryBattleResult = v.object({
  matchId: v.string(),
  chapterId: v.string(),
  stageNumber: v.number(),
});
const vCompleteStoryStageResult = v.object({
  outcome: v.union(v.literal("won"), v.literal("lost"), v.literal("abandoned")),
  starsEarned: v.number(),
  rewards: v.object({
    gold: v.number(),
    xp: v.number(),
    firstClearBonus: v.number(),
  }),
});

const clientPlatformValidator = v.union(
  v.literal("web"),
  v.literal("telegram"),
  v.literal("discord"),
  v.literal("embedded"),
  v.literal("agent"),
  v.literal("cpu"),
  v.literal("unknown"),
);

type ClientPlatform =
  | "web"
  | "telegram"
  | "discord"
  | "embedded"
  | "agent"
  | "cpu"
  | "unknown";

const RESERVED_DECK_IDS = new Set(["undefined", "null", "skip"]);
const normalizeDeckId = (deckId: string | undefined): string | null => {
  if (!deckId) return null;
  const trimmed = deckId.trim();
  if (!trimmed) return null;
  if (RESERVED_DECK_IDS.has(trimmed.toLowerCase())) return null;
  return trimmed;
};

const normalizeDeckRecordId = (deckRecord?: { deckId?: string } | null) =>
  normalizeDeckId(deckRecord?.deckId);

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

const normalizePresenceSource = (source?: string | null) => {
  if (!source) return undefined;
  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 128) : undefined;
};

const inferPlatformFromUser = (
  userId: string | null | undefined,
  userDoc: { privyId?: string } | null,
): ClientPlatform => {
  if (!userId) return "unknown";
  if (userId === "cpu") return "cpu";
  if (typeof userDoc?.privyId === "string" && userDoc.privyId.startsWith("agent:")) {
    return "agent";
  }
  return "unknown";
};

const pickLatestPresence = (
  records: Array<{ userId: string; lastSeenAt: number } & Record<string, any>>,
): Map<string, (typeof records)[number]> => {
  const byUser = new Map<string, (typeof records)[number]>();
  for (const row of records) {
    const existing = byUser.get(row.userId);
    if (!existing || row.lastSeenAt > existing.lastSeenAt) {
      byUser.set(row.userId, row);
    }
  }
  return byUser;
};

async function upsertMatchPresenceRecord(
  ctx: any,
  args: {
    matchId: string;
    userId: string;
    platform: ClientPlatform;
    source?: string;
  },
) {
  const existing = await ctx.db
    .query("matchPresence")
    .withIndex("by_match_user", (q: any) =>
      q.eq("matchId", args.matchId).eq("userId", args.userId),
    )
    .first();

  const now = Date.now();
  const source = normalizePresenceSource(args.source);
  if (existing) {
    await ctx.db.patch(existing._id, {
      platform: args.platform,
      source,
      lastSeenAt: now,
    });
    return now;
  }

  await ctx.db.insert("matchPresence", {
    matchId: args.matchId,
    userId: args.userId,
    platform: args.platform,
    source,
    lastSeenAt: now,
    createdAt: now,
  });
  return now;
}

const resolveDefaultStarterDeckCode = () => {
  const configured = STARTER_DECKS.find((deck) => DECK_RECIPES[deck.deckCode]);
  if (configured?.deckCode) return configured.deckCode;
  const keys = Object.keys(DECK_RECIPES);
  return keys[0] ?? null;
};

const CARD_LOOKUP_CACHE_TTL_MS = 60_000;
const AI_TURN_QUEUE_DEDUPE_MS = 5_000;

let cachedCardDefinitions: any[] | null = null;
let cachedCardLookup: Record<string, any> | null = null;
let cachedCardLookupAt = 0;

async function getCachedCardDefinitions(ctx: any): Promise<any[]> {
  const now = Date.now();
  if (cachedCardDefinitions && now - cachedCardLookupAt < CARD_LOOKUP_CACHE_TTL_MS) {
    return cachedCardDefinitions;
  }

  const allCards = await cards.cards.getAllCards(ctx);
  const normalizedCards = Array.isArray(allCards) ? allCards : [];
  const nextLookup: Record<string, any> = {};
  for (const card of normalizedCards) {
    if (card?._id) {
      nextLookup[card._id] = card;
    }
  }

  cachedCardDefinitions = normalizedCards;
  cachedCardLookup = nextLookup;
  cachedCardLookupAt = now;
  return normalizedCards;
}

async function getCachedCardLookup(ctx: any): Promise<Record<string, any>> {
  const now = Date.now();
  if (cachedCardLookup && now - cachedCardLookupAt < CARD_LOOKUP_CACHE_TTL_MS) {
    return cachedCardLookup;
  }
  await getCachedCardDefinitions(ctx);
  return cachedCardLookup ?? {};
}

async function queueAITurn(ctx: any, matchId: string): Promise<boolean> {
  const queuedRows = await ctx.db
    .query("aiTurnQueue")
    .withIndex("by_matchId", (q: any) => q.eq("matchId", matchId))
    .collect();
  const now = Date.now();

  const hasFreshJob = queuedRows.some(
    (queuedRow: any) => now - queuedRow.createdAt < AI_TURN_QUEUE_DEDUPE_MS,
  );

  for (const queuedRow of queuedRows) {
    if (now - queuedRow.createdAt >= AI_TURN_QUEUE_DEDUPE_MS) {
      await ctx.db.delete(queuedRow._id);
    }
  }

  if (hasFreshJob) {
    return false;
  }

  await ctx.db.insert("aiTurnQueue", {
    matchId,
    createdAt: now,
  });
  return true;
}

async function claimQueuedAITurn(ctx: any, matchId: string): Promise<boolean> {
  const queuedRows = await ctx.db
    .query("aiTurnQueue")
    .withIndex("by_matchId", (q: any) => q.eq("matchId", matchId))
    .collect();
  if (queuedRows.length === 0) {
    return false;
  }

  for (const queuedRow of queuedRows) {
    await ctx.db.delete(queuedRow._id);
  }
  return true;
}

const createStarterDeckFromRecipe = async (ctx: any, userId: string) => {
  const deckCode = resolveDefaultStarterDeckCode();
  if (!deckCode) return null;

  const recipe = DECK_RECIPES[deckCode];
  if (!recipe) return null;

  const allCards = await getCachedCardDefinitions(ctx);
  const byName = new Map<string, any>();
  for (const c of allCards ?? []) {
    byName.set(c.name, c);
  }

  const resolvedCards: { cardDefinitionId: string; quantity: number }[] = [];
  for (const entry of recipe) {
    const cardDef = byName.get(entry.cardName);
    if (!cardDef) return null;
    resolvedCards.push({ cardDefinitionId: cardDef._id, quantity: entry.copies });
  }

  for (const rc of resolvedCards) {
    await cards.cards.addCardsToInventory(ctx, {
      userId,
      cardDefinitionId: rc.cardDefinitionId,
      quantity: rc.quantity,
      source: "starter_deck",
    });
  }

  const deckName =
    STARTER_DECKS.find((deck) => deck.deckCode === deckCode)?.name ?? deckCode;
  const deckId = await cards.decks.createDeck(ctx, userId, deckName, {
    deckArchetype: deckCode.replace("_starter", ""),
  });
  await cards.decks.saveDeck(ctx, deckId, resolvedCards);
  await cards.decks.setActiveDeck(ctx, userId, deckId);
  await ctx.db.patch(userId, { activeDeckId: deckId });
  return deckId;
};

function resolveDeckCards(
  allCards: any[],
  recipe: Array<{ cardName: string; copies: number }>,
): { cardDefinitionId: string; quantity: number }[] {
  const byName = new Map<string, any>();
  for (const card of allCards ?? []) {
    if (typeof card?.name === "string") {
      byName.set(card.name, card);
    }
  }

  const resolved: { cardDefinitionId: string; quantity: number }[] = [];
  for (const entry of recipe) {
    const cardDef = byName.get(entry.cardName);
    if (!cardDef?._id) continue;
    resolved.push({
      cardDefinitionId: String(cardDef._id),
      quantity: Number(entry.copies ?? 0),
    });
  }
  return resolved.filter((entry) => entry.quantity > 0);
}

async function resolveActiveDeckIdForUser(
  ctx: any,
  user: { _id: string; activeDeckId?: string },
) {
  const activeDecks = await cards.decks.getUserDecks(ctx, user._id);
  const requestedDeckId = normalizeDeckId(user.activeDeckId);
  const preferredDeckId = requestedDeckId
    ? normalizeDeckRecordId(
        activeDecks
          ? activeDecks.find((deck: { deckId: string }) => deck.deckId === requestedDeckId)
          : null,
      )
    : null;

  const firstDeckId =
    activeDecks?.map(normalizeDeckRecordId).find((id: string | null) => Boolean(id)) ?? null;

  const fallbackDeckId = preferredDeckId ?? firstDeckId;
  if (!fallbackDeckId) {
    return createStarterDeckFromRecipe(ctx, user._id);
  }

  if (user.activeDeckId !== fallbackDeckId) {
    await ctx.db.patch(user._id, { activeDeckId: fallbackDeckId });
  }
  return fallbackDeckId;
}

export async function resolveActiveDeckForStory(
  ctx: any,
  user: { _id: string; activeDeckId?: string },
) {
  const deckId = await resolveActiveDeckIdForUser(ctx, user);
  if (!deckId) throw new ConvexError("No active deck set");

  const deckData = await cards.decks.getDeckWithCards(ctx, deckId);
  if (!deckData) {
    await cards.decks.setActiveDeck(ctx, user._id, deckId);
    const fallbackDeckId = await resolveActiveDeckIdForUser(ctx, {
      ...user,
      activeDeckId: undefined,
    });
    if (!fallbackDeckId) {
      throw new ConvexError("Active deck not found");
    }
    const fallbackDeckData = await cards.decks.getDeckWithCards(ctx, fallbackDeckId);
    if (!fallbackDeckData) {
      throw new ConvexError("Deck not found");
    }
    return { deckId: fallbackDeckId, deckData: fallbackDeckData };
  }

  return { deckId, deckData };
}

// ── Card Queries ───────────────────────────────────────────────────

export const getAllCards = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => cards.cards.getAllCards(ctx),
});

const vCatalogCard = v.object({
  _id: v.string(),
  name: v.string(),
  cardType: v.string(),
  archetype: v.optional(v.string()),
  attack: v.optional(v.number()),
  defense: v.optional(v.number()),
  flavorText: v.optional(v.string()),
  rarity: v.optional(v.string()),
  isActive: v.boolean(),
});

const vUserCardCount = v.object({
  cardDefinitionId: v.string(),
  quantity: v.number(),
});

export const getCatalogCards = query({
  args: {},
  returns: v.array(vCatalogCard),
  handler: async (ctx) => {
    const allCards = await getCachedCardDefinitions(ctx);
    return allCards
      .map((card: any) => ({
        _id: String(card?._id ?? ""),
        name: String(card?.name ?? ""),
        cardType: String(card?.cardType ?? ""),
        archetype: typeof card?.archetype === "string" ? card.archetype : undefined,
        attack: typeof card?.attack === "number" ? card.attack : undefined,
        defense: typeof card?.defense === "number" ? card.defense : undefined,
        flavorText: typeof card?.flavorText === "string" ? card.flavorText : undefined,
        rarity: typeof card?.rarity === "string" ? card.rarity : undefined,
        isActive: Boolean(card?.isActive),
      }))
      .filter((card) => card._id.length > 0 && card.name.length > 0 && card.cardType.length > 0);
  },
});

export const getUserCardCounts = query({
  args: {},
  returns: v.array(vUserCardCount),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const userCards = await cards.cards.getUserCards(ctx, user._id);
    return (userCards ?? [])
      .map((userCard: any) => ({
        cardDefinitionId: String(userCard?.cardDefinitionId ?? ""),
        quantity: Number(userCard?.quantity ?? 0),
      }))
      .filter(
        (userCard: { cardDefinitionId: string; quantity: number }) =>
          userCard.cardDefinitionId.length > 0 && userCard.quantity > 0,
      );
  },
});

export const getStarterDecks = query({
  args: {},
  returns: v.any(),
  handler: async () => STARTER_DECKS,
});

export const getUserCards = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return cards.cards.getUserCards(ctx, user._id);
  },
});

export const getUserDecks = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return cards.decks.getUserDecks(ctx, user._id);
  },
});

export const getDeckWithCards = query({
  args: { deckId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const deckId = normalizeDeckId(args.deckId);
    if (!deckId) return null;
    return cards.decks.getDeckWithCards(ctx, deckId);
  },
});

// ── Deck Mutations ─────────────────────────────────────────────────

export const createDeck = mutation({
  args: { name: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const activeDeckId = await resolveActiveDeckIdForUser(ctx, user);
    if (!activeDeckId) {
      throw new ConvexError("Select a starter deck before creating a custom deck.");
    }

    const deckId = await cards.decks.createDeck(ctx, user._id, args.name);
    await cards.decks.setActiveDeck(ctx, user._id, deckId);
    await ctx.db.patch(user._id, { activeDeckId: deckId });
    return deckId;
  },
});

export const saveDeck = mutation({
  args: {
    deckId: v.string(),
    cards: v.array(v.object({ cardDefinitionId: v.string(), quantity: v.number() })),
  },
  returns: v.any(),
  handler: async (ctx, args) => cards.decks.saveDeck(ctx, args.deckId, args.cards),
});

export const setActiveDeck = mutation({
  args: { deckId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const deckId = normalizeDeckId(args.deckId);
    if (!deckId) {
      throw new ConvexError("Invalid deck id");
    }
    await cards.decks.setActiveDeck(ctx, user._id, deckId);
    await ctx.db.patch(user._id, { activeDeckId: deckId });
    return null;
  },
});

// ── Starter Deck Selection ─────────────────────────────────────────
//
// Uses DECK_RECIPES to grant exactly the right cards + build the deck.
// Bypasses the component's selectStarterDeck which expects pre-filtered
// card arrays that don't match our data model.

export const selectStarterDeck = mutation({
  args: { deckCode: v.string() },
  returns: vStarterDeckSelectionResult,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const requestedArchetype = args.deckCode.replace("_starter", "");

    // Check if user already picked a starter deck
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
        if (user.activeDeckId !== existingDeck.deckId) {
          await ctx.db.patch(user._id, { activeDeckId: existingDeck.deckId });
        }

        return {
          deckId: existingDeck.deckId,
          cardCount: existingDeck.cardCount ?? 0,
        };
      }
    }

    // Look up the recipe
    const recipe = DECK_RECIPES[args.deckCode];
    if (!recipe) {
      throw new ConvexError(`Unknown deck code: ${args.deckCode}`);
    }

    const allCards = await getCachedCardDefinitions(ctx);
    const resolvedCards = resolveDeckCards(allCards ?? [], recipe);
    if (resolvedCards.length === 0) {
      throw new ConvexError("No cards available to build starter deck.");
    }

    // Grant cards to inventory (so saveDeck's ownership check passes)
    for (const rc of resolvedCards) {
      await cards.cards.addCardsToInventory(ctx, {
        userId: user._id,
        cardDefinitionId: rc.cardDefinitionId,
        quantity: rc.quantity,
        source: "starter_deck",
      });
    }

    // Create the deck
    const archetype = requestedArchetype;
    const deckId = await cards.decks.createDeck(ctx, user._id, args.deckCode, {
      deckArchetype: archetype,
    });

    // Populate with recipe cards
    await cards.decks.saveDeck(ctx, deckId, resolvedCards);

    // Set as active
    await cards.decks.setActiveDeck(ctx, user._id, deckId);
    await ctx.db.patch(user._id, { activeDeckId: deckId });

    const totalCards = resolvedCards.reduce((sum, c) => sum + c.quantity, 0);
    return { deckId, cardCount: totalCards };
  },
});

// ── PvP Lobby + Join ───────────────────────────────────────────────

export const getMyOpenPvPLobby = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const lobby = await match.getOpenLobbyByHost(ctx, { hostId: user._id });
    if (!lobby || (lobby as any).mode !== "pvp") return null;
    return lobby;
  },
});

export const createPvPLobby = mutation({
  args: {
    platform: v.optional(clientPlatformValidator),
    source: v.optional(v.string()),
  },
  returns: v.object({
    matchId: v.string(),
    mode: v.literal("pvp"),
    status: v.literal("waiting"),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existingLobby = await match.getOpenLobbyByHost(ctx, { hostId: user._id });
    if (existingLobby) {
      if ((existingLobby as any).mode !== "pvp") {
        throw new Error("You already have an open non-PvP lobby. Finish or cancel it first.");
      }
      return {
        matchId: String((existingLobby as any)._id),
        mode: "pvp" as const,
        status: "waiting" as const,
      };
    }

    const { deckData } = await resolveActiveDeckForStory(ctx, user);
    const playerDeck = getDeckCardIdsFromDeckData(deckData);
    if (playerDeck.length < 30) {
      throw new Error("Deck must have at least 30 cards.");
    }

    const matchId = await match.createMatch(ctx, {
      hostId: user._id,
      awayId: null,
      mode: "pvp",
      hostDeck: playerDeck,
      isAIOpponent: false,
    });

    if (args.platform) {
      await upsertMatchPresenceRecord(ctx, {
        matchId: String(matchId),
        userId: user._id,
        platform: args.platform,
        source: args.source,
      });
    }

    return {
      matchId: String(matchId),
      mode: "pvp" as const,
      status: "waiting" as const,
    };
  },
});

export const joinPvPMatch = mutation({
  args: {
    matchId: v.string(),
    platform: v.optional(clientPlatformValidator),
    source: v.optional(v.string()),
  },
  returns: v.object({
    matchId: v.string(),
    seat: v.literal("away"),
    status: v.literal("active"),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if (!meta) throw new Error("Match not found.");

    if ((meta as any).mode !== "pvp") {
      throw new Error("Only PvP lobbies can be joined with this flow.");
    }
    if ((meta as any).isAIOpponent) {
      throw new Error("Cannot join a match configured for a built-in CPU opponent.");
    }
    if ((meta as any).status !== "waiting") {
      throw new Error(`Match is not waiting (status: ${(meta as any).status ?? "unknown"}).`);
    }
    if ((meta as any).awayId !== null) {
      throw new Error("Match already has an away player.");
    }

    const hostId = (meta as any).hostId as string | null;
    if (!hostId) {
      throw new Error("Match host is missing.");
    }
    if (hostId === user._id) {
      throw new Error("Cannot join your own lobby as away player.");
    }

    const hostDeck = (meta as any).hostDeck;
    if (!Array.isArray(hostDeck) || hostDeck.length < 30) {
      throw new Error("Host deck is invalid.");
    }

    const { deckData } = await resolveActiveDeckForStory(ctx, user);
    const awayDeck = getDeckCardIdsFromDeckData(deckData);
    if (awayDeck.length < 30) {
      throw new Error("Deck must have at least 30 cards.");
    }

    const allCards = await cards.cards.getAllCards(ctx);
    const cardLookup = buildCardLookup(allCards as any);
    const seed = buildMatchSeed([
      "joinPvPMatch",
      args.matchId,
      hostId,
      user._id,
      hostDeck.length,
      awayDeck.length,
      hostDeck[0],
      awayDeck[0],
    ]);

    const firstPlayer: "host" | "away" = seed % 2 === 0 ? "host" : "away";
    const initialState = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      hostId,
      user._id,
      hostDeck,
      awayDeck,
      firstPlayer,
      makeRng(seed),
    );

    await match.joinMatch(ctx, {
      matchId: args.matchId,
      awayId: user._id,
      awayDeck,
    });

    await match.startMatch(ctx, {
      matchId: args.matchId,
      initialState: JSON.stringify(initialState),
    });

    if (args.platform) {
      await upsertMatchPresenceRecord(ctx, {
        matchId: args.matchId,
        userId: user._id,
        platform: args.platform,
        source: args.source,
      });
    }

    return {
      matchId: args.matchId,
      seat: "away" as const,
      status: "active" as const,
    };
  },
});

// ── Story Queries ──────────────────────────────────────────────────

export const getChapters = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => story.chapters.getChapters(ctx, { status: "published" }),
});

export const getChapterStages = query({
  args: { chapterId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => story.stages.getStages(ctx, args.chapterId),
});

export const getStoryProgress = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return story.progress.getProgress(ctx, user._id);
  },
});

export const getStageProgress = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return story.progress.getStageProgress(ctx, user._id);
  },
});

export const getStageWithNarrative = query({
  args: { chapterId: v.string(), stageNumber: v.number() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const stages = await story.stages.getStages(ctx, args.chapterId);
    const stage = (stages as any[])?.find(
      (s: any) => s.stageNumber === args.stageNumber,
    );
    if (!stage) return null;
    return {
      ...stage,
      narrative: {
        preMatchDialogue: stage.preMatchDialogue ?? [],
        postMatchWinDialogue: stage.postMatchWinDialogue ?? [],
        postMatchLoseDialogue: stage.postMatchLoseDialogue ?? [],
      },
    };
  },
});

export const getFullStoryProgress = query({
  args: {},
  returns: v.object({
    chapters: v.any(),
    chapterProgress: v.any(),
    stageProgress: v.any(),
    totalStars: v.number(),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const allChapters = await story.chapters.getChapters(ctx, { status: "published" });
    const chapterProgress = await story.progress.getProgress(ctx, user._id);
    const allStageProgress = await story.progress.getStageProgress(ctx, user._id);
    const totalStars = ((allStageProgress as any[]) ?? []).reduce(
      (sum: number, p: any) => sum + (p.starsEarned ?? 0),
      0,
    );
    return {
      chapters: allChapters,
      chapterProgress,
      stageProgress: allStageProgress,
      totalStars,
    };
  },
});

export function getDeckCardIdsFromDeckData(deckData: any): string[] {
  const playerDeck: string[] = [];
  for (const card of (deckData as any).cards ?? []) {
    for (let i = 0; i < (card.quantity ?? 1); i++) {
      playerDeck.push(card.cardDefinitionId);
    }
  }
  return playerDeck;
}

export function findStageByNumber(stages: any, stageNumber: number) {
  return (stages as any[])?.find((s: any) => s.stageNumber === stageNumber);
}

function compareStoryChaptersByOrder(a: any, b: any) {
  const actDelta = (a?.actNumber ?? 0) - (b?.actNumber ?? 0);
  if (actDelta !== 0) return actDelta;
  return (a?.chapterNumber ?? 0) - (b?.chapterNumber ?? 0);
}

function isChapterProgressCompleted(entry: any) {
  if (!entry) return false;
  if (entry.status === "starred" || entry.status === "completed") return true;
  return Number(entry.timesCompleted ?? 0) > 0;
}

function isStageProgressCompleted(entry: any) {
  if (!entry) return false;
  if (entry.status === "starred" || entry.status === "completed") return true;
  return Number(entry.timesCompleted ?? 0) > 0;
}

function resolveStoryLevelFromProgress(progress: any[]) {
  let maxCompletedAct = 0;
  for (const entry of progress ?? []) {
    if (!isChapterProgressCompleted(entry)) continue;
    const actNumber = Number(entry.actNumber ?? 0);
    if (!Number.isFinite(actNumber) || actNumber < 0) continue;
    maxCompletedAct = Math.max(maxCompletedAct, actNumber);
  }

  // Acts start at 1; derive a small, stable player level fallback.
  return Math.max(1, maxCompletedAct + 1);
}

export function normalizeFirstClearBonus(rawBonus: unknown): number {
  if (typeof rawBonus === "number") return Number.isFinite(rawBonus) ? rawBonus : 0;
  if (!rawBonus || typeof rawBonus !== "object") return 0;
  const typedBonus = rawBonus as {
    gold?: number;
    xp?: number;
    gems?: number;
  };
  const gold = Number(typedBonus.gold ?? 0);
  const xp = Number(typedBonus.xp ?? 0);
  const gems = Number(typedBonus.gems ?? 0);
  const total = gold + xp + gems;
  return Number.isFinite(total) ? total : 0;
}

const STORY_DEFAULT_DIFFICULTY = "normal" as const;

export async function assertStoryStageUnlocked(
  ctx: any,
  userId: string,
  chapterId: string,
  stageNumber: number,
) {
  const chapter = await story.chapters.getChapter(ctx, chapterId as any);
  if (!chapter) {
    throw new ConvexError("Chapter not found");
  }

  const stages = await story.stages.getStages(ctx, chapterId);
  const stage = findStageByNumber(stages, stageNumber);
  if (!stage) {
    throw new ConvexError(`Stage ${stageNumber} not found in chapter`);
  }

  const allChapters = await story.chapters.getChapters(ctx, { status: "published" });
  const sortedChapters = [...(allChapters ?? [])].sort(compareStoryChaptersByOrder);
  const chapterIndex = sortedChapters.findIndex((item: any) => item?._id === chapterId);
  if (chapterIndex === -1) {
    throw new ConvexError("Chapter is not available");
  }

  const unlockRequirements = chapter.unlockRequirements ?? {};
  if (typeof unlockRequirements.minimumLevel === "number") {
    const progress = await story.progress.getProgress(ctx, userId);
    const playerLevel = resolveStoryLevelFromProgress(progress ?? []);
    if (playerLevel < unlockRequirements.minimumLevel) {
      throw new ConvexError(
        `Minimum level ${unlockRequirements.minimumLevel} is required to access this chapter.`,
      );
    }
  }

  if (unlockRequirements.previousChapter || unlockRequirements.requiredChapterId) {
    let requiredChapterId =
      unlockRequirements.requiredChapterId?.trim?.() ??
      (unlockRequirements.previousChapter && chapterIndex > 0 ? sortedChapters[chapterIndex - 1]?._id : "");

    if (requiredChapterId) {
      const requiredChapter = await story.chapters.getChapter(ctx, requiredChapterId);
      if (!requiredChapter) {
        throw new ConvexError("Required chapter not found");
      }

      const requiredChapterProgress = await story.progress.getChapterProgress(
        ctx,
        userId,
        requiredChapter.actNumber ?? 0,
        requiredChapter.chapterNumber ?? 0,
      );
      if (!isChapterProgressCompleted(requiredChapterProgress)) {
        throw new ConvexError("Previous chapter must be completed first");
      }
    }
  }

  if (stageNumber > 1) {
    const previousStage = findStageByNumber(stages, stageNumber - 1);
    if (!previousStage) {
      throw new ConvexError(`Previous stage ${stageNumber - 1} not found in chapter`);
    }

    const previousProgress = await story.progress.getStageProgress(
      ctx,
      userId,
      previousStage._id,
    );
    if (!isStageProgressCompleted(previousProgress)) {
      throw new ConvexError(`Stage ${stageNumber - 1} must be cleared first`);
    }
  }

  const existingProgress = await story.progress.getChapterProgress(
    ctx,
    userId,
    chapter.actNumber ?? 0,
    chapter.chapterNumber ?? 0,
  );

  await story.progress.upsertProgress(ctx, {
    userId,
    actNumber: chapter.actNumber ?? 0,
    chapterNumber: chapter.chapterNumber ?? 0,
    difficulty: STORY_DEFAULT_DIFFICULTY,
    status: existingProgress?.status === "completed" ? "completed" : "in_progress",
    starsEarned: existingProgress?.starsEarned ?? 0,
    timesAttempted: (existingProgress?.timesAttempted ?? 0) + 1,
    timesCompleted: existingProgress?.timesCompleted ?? 0,
    firstCompletedAt: existingProgress?.firstCompletedAt,
    lastAttemptedAt: Date.now(),
    bestScore: existingProgress?.bestScore,
  });

  return { chapter, stage, stages };
}

async function markStoryChapterProgress(
  ctx: any,
  userId: string,
  chapter: any,
  isCompleted: boolean,
) {
  const existingProgress = await story.progress.getChapterProgress(
    ctx,
    userId,
    chapter.actNumber ?? 0,
    chapter.chapterNumber ?? 0,
  );

  const newStatus = isCompleted
    ? "completed"
    : existingProgress?.status === "completed"
      ? "completed"
      : existingProgress?.status === "in_progress"
        ? "in_progress"
        : "available";

  const nextTimesCompleted = (existingProgress?.timesCompleted ?? 0) + (isCompleted ? 1 : 0);
  const starsEarned = isCompleted
    ? Number(existingProgress?.starsEarned ?? 0)
    : Number(existingProgress?.starsEarned ?? 0);

  await story.progress.upsertProgress(ctx, {
    userId,
    actNumber: chapter.actNumber ?? 0,
    chapterNumber: chapter.chapterNumber ?? 0,
    difficulty: STORY_DEFAULT_DIFFICULTY,
    status: newStatus,
    starsEarned,
    timesAttempted: (existingProgress?.timesAttempted ?? 0),
    timesCompleted: nextTimesCompleted,
    firstCompletedAt:
      existingProgress?.firstCompletedAt ?? (isCompleted ? Date.now() : undefined),
    lastAttemptedAt: Date.now(),
    bestScore: existingProgress?.bestScore,
  });
}

async function updateCompletedChapterProgress(ctx: any, userId: string, chapterId: string, chapter: any) {
  const stages = await story.stages.getStages(ctx, chapterId);
  let allCleared = false;
  if (!Array.isArray(stages) || stages.length === 0) {
    allCleared = true;
  } else {
    const clearChecks = await Promise.all(
      stages.map((stageRow: any) =>
        story.progress.getStageProgress(ctx, userId, stageRow._id),
      ),
    );
    allCleared = clearChecks.every(isStageProgressCompleted);
  }

  await markStoryChapterProgress(ctx, userId, chapter, allCleared);
}

// ── Start Story Battle ─────────────────────────────────────────────

export const startStoryBattle = mutation({
  args: {
    chapterId: v.string(),
    stageNumber: v.optional(v.number()),
  },
  returns: vStoryBattleResult,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
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

    const allCards = await getCachedCardDefinitions(ctx);
    const aiDeck = buildAIDeck(allCards);

    const cardLookup = buildCardLookup(allCards as any);
    const seed = buildMatchSeed([
      "story",
      user._id,
      "host",
      args.chapterId,
      stageNum,
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
      mode: "story",
      hostDeck: playerDeck,
      awayDeck: aiDeck,
      isAIOpponent: true,
    });

    await match.startMatch(ctx, {
      matchId,
      initialState: JSON.stringify(initialState),
    });

    // Link match to story context in host-layer table
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

export const startStoryBattleForAgent = mutation({
  args: {
    chapterId: v.string(),
    stageNumber: v.optional(v.number()),
  },
  returns: v.object({
    matchId: v.string(),
    chapterId: v.string(),
    stageNumber: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const stageNum = args.stageNumber ?? 1;
    const { stage } = await assertStoryStageUnlocked(
      ctx,
      user._id,
      args.chapterId,
      stageNum,
    );

    const existingLobby = await match.getOpenLobbyByHost(ctx, { hostId: user._id });
    if (existingLobby) {
      throw new ConvexError("You already have an open waiting match. Finish or cancel it first.");
    }

    const { deckData } = await resolveActiveDeckForStory(ctx, user);
    const playerDeck = getDeckCardIdsFromDeckData(deckData);
    if (playerDeck.length < 30) throw new ConvexError("Deck must have at least 30 cards");

    const matchId = await match.createMatch(ctx, {
      hostId: user._id,
      awayId: null,
      mode: "story",
      hostDeck: playerDeck,
      isAIOpponent: false,
    });

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

export const cancelWaitingStoryMatch = mutation({
  args: { matchId: v.string() },
  returns: v.object({
    matchId: v.string(),
    canceled: v.boolean(),
    status: v.literal("ended"),
    outcome: v.union(v.literal("abandoned"), v.literal("none")),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if (!meta) {
      throw new ConvexError("Match not found.");
    }

    if (meta.hostId !== user._id) {
      throw new ConvexError("You are not the host of this match.");
    }

    if ((meta as any).status !== "waiting") {
      throw new ConvexError(`Match is not cancellable (status: ${(meta as any).status}).`);
    }

    if ((meta as any).awayId !== null) {
      throw new ConvexError("Cannot cancel match after an away player has joined.");
    }

    await (ctx.db.patch as any)((meta as any)._id, {
      status: "ended",
      endReason: "host_canceled",
      endedAt: Date.now(),
    });

    const storyMatch = await ctx.db
      .query("storyMatches")
      .withIndex("by_matchId", (q: any) => q.eq("matchId", args.matchId))
      .first();
    if (storyMatch && !storyMatch.outcome) {
      await ctx.db.patch(storyMatch._id, {
        outcome: "abandoned",
        completedAt: Date.now(),
      });
    }

    return {
      matchId: args.matchId,
      canceled: true,
      status: "ended" as const,
      outcome: "abandoned" as const,
    };
  },
});

export function buildAIDeck(allCards: any[]): string[] {
  const active = (allCards ?? []).filter((c: any) => c.isActive);
  const stereotypes = active.filter((c: any) => c.cardType === "stereotype");
  const spells = active.filter((c: any) => c.cardType === "spell");
  const traps = active.filter((c: any) => c.cardType === "trap");

  const deck: string[] = [];

  for (const card of stereotypes.slice(0, 7)) {
    for (let i = 0; i < 3; i++) deck.push(card._id);
  }
  for (const card of spells.slice(0, 6)) {
    for (let i = 0; i < 2; i++) deck.push(card._id);
  }
  for (const card of traps.slice(0, 4)) {
    for (let i = 0; i < 2; i++) deck.push(card._id);
  }

  while (deck.length < 40 && active.length > 0) {
    deck.push(active[deck.length % active.length]._id);
  }

  return deck.slice(0, 40);
}

function resolveAICupSeat(meta: any): "host" | "away" | null {
  if (!meta || !(meta as any)?.isAIOpponent) return null;
  if ((meta as any)?.hostId === "cpu") return "host";
  if ((meta as any)?.awayId === "cpu") return "away";
  return null;
}

function resolveSeatForUser(meta: any, userId: string): "host" | "away" | null {
  if (!meta || !userId) return null;
  if ((meta as any)?.hostId === userId) return "host";
  if ((meta as any)?.awayId === userId) return "away";
  return null;
}

// ── Match Presence / Platform Tags ────────────────────────────────

export const upsertMatchPresence = mutation({
  args: {
    matchId: v.string(),
    platform: clientPlatformValidator,
    source: v.optional(v.string()),
  },
  returns: v.object({
    matchId: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
    platform: clientPlatformValidator,
    lastSeenAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if (!meta) throw new Error("Match not found.");

    const seat = resolveSeatForUser(meta, user._id);
    if (!seat) {
      throw new Error("You are not a participant in this match.");
    }

    const lastSeenAt = await upsertMatchPresenceRecord(ctx, {
      matchId: args.matchId,
      userId: user._id,
      platform: args.platform,
      source: args.source,
    });

    return {
      matchId: args.matchId,
      seat,
      platform: args.platform,
      lastSeenAt,
    };
  },
});

export const getMatchPlatformTags = query({
  args: { matchId: v.string() },
  returns: v.union(
    v.object({
      matchId: v.string(),
      host: v.object({
        userId: v.string(),
        username: v.string(),
        platform: clientPlatformValidator,
        source: v.union(v.string(), v.null()),
        lastSeenAt: v.union(v.number(), v.null()),
      }),
      away: v.union(
        v.object({
          userId: v.string(),
          username: v.string(),
          platform: clientPlatformValidator,
          source: v.union(v.string(), v.null()),
          lastSeenAt: v.union(v.number(), v.null()),
        }),
        v.null(),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if (!meta) return null;

    const hostId = typeof (meta as any).hostId === "string" ? (meta as any).hostId : "";
    const awayIdRaw = (meta as any).awayId;
    const awayId =
      typeof awayIdRaw === "string" && awayIdRaw.trim().length > 0 ? awayIdRaw : null;

    const rows = await ctx.db
      .query("matchPresence")
      .withIndex("by_match", (q: any) => q.eq("matchId", args.matchId))
      .collect();
    const latestByUser = pickLatestPresence(rows as any[]);

    const hostUser = hostId && hostId !== "cpu"
      ? (await ctx.db.get(hostId as any)) as { username?: string; privyId?: string } | null
      : null;
    const awayUser = awayId && awayId !== "cpu"
      ? (await ctx.db.get(awayId as any)) as { username?: string; privyId?: string } | null
      : null;

    const hostPresence = hostId ? latestByUser.get(hostId) : null;
    const awayPresence = awayId ? latestByUser.get(awayId) : null;

    const hostPlatform = hostPresence?.platform ?? inferPlatformFromUser(hostId, hostUser);
    const awayPlatform = awayId
      ? awayPresence?.platform ?? inferPlatformFromUser(awayId, awayUser)
      : null;

    return {
      matchId: args.matchId,
      host: {
        userId: hostId,
        username:
          hostUser?.username ??
          (hostPlatform === "cpu"
            ? "CPU"
            : hostPlatform === "agent"
              ? "Agent"
              : "Host"),
        platform: hostPlatform,
        source: hostPresence?.source ?? null,
        lastSeenAt: hostPresence?.lastSeenAt ?? null,
      },
      away: awayId
        ? {
            userId: awayId,
            username:
              awayUser?.username ??
              (awayPlatform === "cpu"
                ? "CPU"
                : awayPlatform === "agent"
                  ? "Agent"
                  : "Opponent"),
            platform: awayPlatform ?? "unknown",
            source: awayPresence?.source ?? null,
            lastSeenAt: awayPresence?.lastSeenAt ?? null,
          }
        : null,
    };
  },
});

// ── Submit Action ──────────────────────────────────────────────────

export const submitAction = mutation({
  args: {
    matchId: v.string(),
    command: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
    expectedVersion: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return submitActionForActor(ctx, {
      matchId: args.matchId,
      command: args.command,
      seat: args.seat,
      expectedVersion: args.expectedVersion,
      actorUserId: user._id,
    });
  },
});

export const submitActionAsActor = internalMutation({
  args: {
    matchId: v.string(),
    command: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
    expectedVersion: v.optional(v.number()),
    actorUserId: v.id("users"),
  },
  returns: v.any(),
  handler: async (ctx, args) =>
    submitActionForActor(ctx, {
      matchId: args.matchId,
      command: args.command,
      seat: args.seat,
      expectedVersion: args.expectedVersion,
      actorUserId: args.actorUserId,
    }),
});

// ── AI Decision Logic ──────────────────────────────────────────────

function pickAICommand(
  view: any,
  cardLookup: Record<string, any>
): Command {
  const phase = view.currentPhase;
  const hand = Array.isArray(view?.hand) ? view.hand : [];
  const board = Array.isArray(view?.board) ? view.board : [];
  const opponentBoard = Array.isArray(view?.opponentBoard)
    ? view.opponentBoard
    : [];
  const spellTrapZone = Array.isArray(view?.spellTrapZone)
    ? view.spellTrapZone
    : [];
  const normalSummonedThisTurn = view?.normalSummonedThisTurn === true;
  const maxBoardSlots =
    typeof view?.maxBoardSlots === "number" ? view.maxBoardSlots : 3;
  const maxSpellTrapSlots =
    typeof view?.maxSpellTrapSlots === "number" ? view.maxSpellTrapSlots : 3;

  // Draw/Standby/Breakdown/End phases → ADVANCE_PHASE
  if (
    phase === "draw" ||
    phase === "standby" ||
    phase === "breakdown_check" ||
    phase === "end"
  ) {
    return { type: "ADVANCE_PHASE" };
  }

  // Main phase (main/main2)
  if (phase === "main" || phase === "main2") {
    // 1. Try to summon strongest monster from hand
    const monstersInHand = hand
      .map((id: string) => ({ id, def: cardLookup[id] }))
      .filter((c: any) => c.def?.cardType === "stereotype");

    if (monstersInHand.length > 0 && !normalSummonedThisTurn) {
      // Sort by attack (descending)
      monstersInHand.sort(
        (a: any, b: any) => (b.def?.attack ?? 0) - (a.def?.attack ?? 0)
      );

      const strongest = monstersInHand[0];
      const level = strongest.def?.level ?? 0;

      // Level < 7: no tribute needed
      if (level < 7 && board.length < maxBoardSlots) {
        return {
          type: "SUMMON",
          cardId: strongest.id,
          position: "attack",
        };
      }

      // Level 7+: tribute weakest face-up monster if available
      if (level >= 7 && board.length > 0) {
        const faceUpMonsters = board.filter((c: any) => !c.faceDown);
        if (faceUpMonsters.length > 0) {
          // Find weakest (by attack)
          const weakest = faceUpMonsters.reduce((min: any, card: any) => {
            const minAtk =
              (cardLookup[min.definitionId]?.attack ?? 0) +
              (min.temporaryBoosts?.attack ?? 0);
            const cardAtk =
              (cardLookup[card.definitionId]?.attack ?? 0) +
              (card.temporaryBoosts?.attack ?? 0);
            return cardAtk < minAtk ? card : min;
          });

          return {
            type: "SUMMON",
            cardId: strongest.id,
            position: "attack",
            tributeCardIds: [weakest.cardId],
          };
        }
      }
    }

    // 2. Activate spell cards from hand if any
    const spellsInHand = hand
      .map((id: string) => ({ id, def: cardLookup[id] }))
      .filter((c: any) => c.def?.cardType === "spell");
    if (spellsInHand.length > 0) {
      return {
        type: "ACTIVATE_SPELL",
        cardId: spellsInHand[0].id,
      };
    }

    // 3. Set spells/traps if backrow has space
    const spellsTrapsInHand = hand
      .map((id: string) => ({ id, def: cardLookup[id] }))
      .filter(
        (c: any) => c.def?.cardType === "spell" || c.def?.cardType === "trap"
      );

    if (spellsTrapsInHand.length > 0 && spellTrapZone.length < maxSpellTrapSlots) {
      return {
        type: "SET_SPELL_TRAP",
        cardId: spellsTrapsInHand[0].id,
      };
    }

    // 3. If main phase 1 with monsters on board: advance to combat
    if (phase === "main") {
      const attackableMonsters = board.filter(
        (c: any) => !c.faceDown && c.canAttack && !c.hasAttackedThisTurn
      );
      if (attackableMonsters.length > 0) {
        return { type: "ADVANCE_PHASE" };
      }

      // Default for main phase: end turn
      return { type: "END_TURN" };
    }

    // 4. If main2: end turn
    if (phase === "main2") {
      return { type: "END_TURN" };
    }

    // Combat phase
    if (phase === "combat") {
      // Find all monsters that can attack
      const attackableMonsters = board.filter(
        (c: any) => !c.faceDown && c.canAttack && !c.hasAttackedThisTurn
      );

      if (attackableMonsters.length > 0) {
        const attacker = attackableMonsters[0];
        const attackerId = attacker?.cardId ?? attacker?.instanceId;
        if (!attackerId) return { type: "ADVANCE_PHASE" };

        // Check opponent monsters (including face-down)
        const opponentMonsters = opponentBoard;

        if (opponentMonsters.length === 0) {
          // Direct attack
          return {
            type: "DECLARE_ATTACK",
            attackerId,
          };
        }

        // Find weakest opponent monster
        let weakestOpponent = opponentMonsters[0];
        let weakestAtk =
          (cardLookup[weakestOpponent.definitionId]?.attack ?? 0) +
          (weakestOpponent.temporaryBoosts?.attack ?? 0);

        for (const opp of opponentMonsters) {
          const oppAtk =
            (cardLookup[opp.definitionId]?.attack ?? 0) +
            (opp.temporaryBoosts?.attack ?? 0);
          if (oppAtk < weakestAtk) {
            weakestOpponent = opp;
            weakestAtk = oppAtk;
          }
        }

        const targetId = weakestOpponent.cardId ?? weakestOpponent.instanceId;
        return {
          type: "DECLARE_ATTACK",
          attackerId,
          targetId,
        };
      }
    }
  }

  // No attacks possible, advance phase
  return { type: "ADVANCE_PHASE" };
}

// ── AI Turn ────────────────────────────────────────────────────────

export const executeAITurn = internalMutation({
  args: { matchId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claimed = await claimQueuedAITurn(ctx, args.matchId);
    if (!claimed) return null;

    // Guard: check it's still AI's turn before acting.
    // This prevents duplicate AI turns if the scheduler fires twice
    // (e.g., from rapid player actions or network retries).
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    const aiSeat = resolveAICupSeat(meta);
    if ((meta as any)?.status !== "active" || !aiSeat) return null;

    const cardLookup = await getCachedCardLookup(ctx);

    // Loop up to 20 actions
    for (let i = 0; i < 20; i++) {
      const viewJson = await match.getPlayerView(ctx, {
        matchId: args.matchId,
        seat: aiSeat,
      });
      if (!viewJson) return null;

      const view = JSON.parse(viewJson);

      // Stop if game is over or no longer AI's turn
      if (view.gameOver || view.currentTurnPlayer !== aiSeat) return null;

      if (Array.isArray(view.currentChain) && view.currentChain.length > 0) {
        try {
          await match.submitAction(ctx, {
            matchId: args.matchId,
            command: JSON.stringify({ type: "CHAIN_RESPONSE", pass: true }),
            seat: aiSeat,
          });
        } catch {
          return null;
        }
        continue;
      }

      // Pick AI command
      const command = pickAICommand(view, cardLookup);

      try {
        await match.submitAction(ctx, {
          matchId: args.matchId,
          command: JSON.stringify(command),
          seat: aiSeat,
        });
      } catch {
        // Game ended or state changed between check and submit — safe to ignore
        return null;
      }

      // If command was END_TURN, stop
      if (command.type === "END_TURN") return null;
    }
    return null;
  },
});

// ── Game View Queries ──────────────────────────────────────────────

export const getPlayerView = query({
  args: {
    matchId: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireSeatOwnership(ctx, args.matchId, args.seat, user._id);
    return match.getPlayerView(ctx, args);
  },
});

export const getPlayerViewAsActor = internalQuery({
  args: {
    matchId: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
    actorUserId: v.id("users"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireSeatOwnership(ctx, args.matchId, args.seat, args.actorUserId);
    return match.getPlayerView(ctx, {
      matchId: args.matchId,
      seat: args.seat,
    });
  },
});

export const getOpenPrompt = query({
  args: {
    matchId: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireSeatOwnership(ctx, args.matchId, args.seat, user._id);
    return match.getOpenPrompt(ctx, args);
  },
});

export const getOpenPromptAsActor = internalQuery({
  args: {
    matchId: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
    actorUserId: v.id("users"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireSeatOwnership(ctx, args.matchId, args.seat, args.actorUserId);
    return match.getOpenPrompt(ctx, {
      matchId: args.matchId,
      seat: args.seat,
    });
  },
});

export const getMatchMeta = query({
  args: { matchId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => match.getMatchMeta(ctx, args),
});

export const getRecentEvents = query({
  args: { matchId: v.string(), sinceVersion: v.number() },
  returns: v.any(),
  handler: async (ctx, args) => match.getRecentEvents(ctx, args),
});

export const getLatestSnapshotVersion = query({
  args: { matchId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => match.getLatestSnapshotVersion(ctx, args),
});

export const getActiveMatchByHost = query({
  args: { hostId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => match.getActiveMatchByHost(ctx, args),
});

// ── Story Match Context ─────────────────────────────────────────────

export const getStoryMatchContext = query({
  args: { matchId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("storyMatches")
      .withIndex("by_matchId", (q: any) => q.eq("matchId", args.matchId))
      .first();
    if (!doc) return null;

    // Load the stage data for dialogue and reward info
    let stage = doc.stageId
      ? await story.stages.getStage(ctx, doc.stageId as any)
      : null;
    if (!stage) {
      const stages = await story.stages.getStages(ctx, doc.chapterId);
      stage = findStageByNumber(stages, doc.stageNumber);
    }

    return {
      matchId: doc.matchId,
      chapterId: doc.chapterId,
      userId: doc.userId,
      stageNumber: doc.stageNumber,
      stageId: doc.stageId,
      outcome: doc.outcome ?? null,
      starsEarned: doc.starsEarned ?? null,
      rewardsGold: stage?.rewardGold ?? 0,
      rewardsXp: stage?.rewardXp ?? 0,
      firstClearBonus: normalizeFirstClearBonus(stage?.firstClearBonus),
      preMatchDialogue: stage?.preMatchDialogue ?? [],
      opponentName: stage?.opponentName ?? "Opponent",
      postMatchWinDialogue: stage?.postMatchWinDialogue ?? [],
      postMatchLoseDialogue: stage?.postMatchLoseDialogue ?? [],
    };
  },
});

// ── Complete Story Stage ────────────────────────────────────────────

function calculateStars(won: boolean, finalLP: number, maxLP: number): number {
  if (!won) return 0;
  const ratio = maxLP > 0 ? finalLP / maxLP : 0;
  if (ratio >= 0.75) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}

export const completeStoryStage = mutation({
  args: {
    matchId: v.string(),
    actorUserId: v.optional(v.id("users")),
  },
  returns: vCompleteStoryStageResult,
  handler: async (ctx, args) => {
    const requester = args.actorUserId
      ? await ctx.db.get(args.actorUserId)
      : await requireUser(ctx);

    if (!requester) {
      throw new ConvexError("User not found.");
    }

    // Look up story context
    const storyMatch = await ctx.db
      .query("storyMatches")
      .withIndex("by_matchId", (q: any) => q.eq("matchId", args.matchId))
      .first();
    if (!storyMatch) throw new ConvexError("Not a story match");

    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if (!meta) throw new ConvexError("Match metadata not found");
    const requesterSeat = resolveSeatForUser(meta, requester._id);
    if (storyMatch.userId !== requester._id && !requesterSeat) {
      throw new ConvexError("Not your match");
    }

    const progressOwnerId = storyMatch.userId;

    // Already completed — return cached result
    if (storyMatch.outcome) {
      return {
        outcome: storyMatch.outcome,
        starsEarned: storyMatch.starsEarned ?? 0,
        rewards: {
          gold: storyMatch.rewardsGold ?? 0,
          xp: storyMatch.rewardsXp ?? 0,
          firstClearBonus: storyMatch.firstClearBonus ?? 0,
        },
      };
    }

    // Verify match is ended
    if ((meta as any)?.status !== "ended") {
      throw new ConvexError("Match is not ended yet");
    }

    const winnerSeat = (meta as any)?.winner as "host" | "away" | null;
    const storyPlayerSeat =
      resolveSeatForUser(meta, storyMatch.userId) ?? "host";
    let won = false;

    if (winnerSeat) {
      won = winnerSeat === storyPlayerSeat;
    } else {
      // Fallback when winner isn't set.
      const fallbackViewJson = await match.getPlayerView(ctx, {
        matchId: args.matchId,
        seat: storyPlayerSeat,
      });
      if (fallbackViewJson) {
        const view = JSON.parse(fallbackViewJson);
        const myLife =
          storyPlayerSeat === "host"
            ? view.players?.host?.lifePoints
            : view.players?.away?.lifePoints;
        const oppLife =
          storyPlayerSeat === "host"
            ? view.players?.away?.lifePoints
            : view.players?.host?.lifePoints;
        won = (myLife ?? 0) > (oppLife ?? 0);
      }
    }
    const outcome: "won" | "lost" = won ? "won" : "lost";

    // Get final LP for star calculation
    const viewJson = await match.getPlayerView(ctx, {
      matchId: args.matchId,
      seat: storyPlayerSeat,
    });
    let finalLP = 0;
    const maxLP = 8000;
    if (viewJson) {
      const view = JSON.parse(viewJson);
      finalLP =
        storyPlayerSeat === "host"
          ? view?.players?.host?.lifePoints ?? 0
          : view?.players?.away?.lifePoints ?? 0;
    }

    const starsEarned = calculateStars(won, finalLP, maxLP);

    // Look up stage for rewards
    const stages = await story.stages.getStages(ctx, storyMatch.chapterId);
    const stage = findStageByNumber(stages, storyMatch.stageNumber);
    if (!stage) {
      throw new ConvexError("Stage not found");
    }

    const rewardGold = won ? (stage.rewardGold ?? 0) : 0;
    const rewardXp = won ? (stage.rewardXp ?? 0) : 0;

    const chapter = await story.chapters.getChapter(ctx, storyMatch.chapterId as any);
    if (!chapter) {
      throw new ConvexError("Chapter not found");
    }

    const chapterProgress = await story.progress.getChapterProgress(
      ctx,
      progressOwnerId,
      chapter.actNumber ?? 0,
      chapter.chapterNumber ?? 0,
    );
    const chapterProgressId =
      chapterProgress?._id ??
      (await story.progress.upsertProgress(ctx, {
        userId: progressOwnerId,
        actNumber: chapter.actNumber ?? 0,
        chapterNumber: chapter.chapterNumber ?? 0,
        difficulty: STORY_DEFAULT_DIFFICULTY,
        status: "available",
        starsEarned: 0,
        timesAttempted: 1,
        timesCompleted: 0,
        firstCompletedAt: undefined,
        lastAttemptedAt: Date.now(),
      }));
    if (!chapterProgressId) {
      throw new ConvexError("Unable to create chapter progress");
    }

    if (won) {
      const existingProgress = await story.progress.getStageProgress(
        ctx,
        progressOwnerId,
        storyMatch.stageId,
      );
      const prevTimesCompleted = Number(existingProgress?.timesCompleted ?? 0);
      const prevStarsEarned = Number(existingProgress?.starsEarned ?? 0);
      const prevFirstClearClaimed = Boolean(existingProgress?.firstClearClaimed ?? false);
      const isFirstClear = prevTimesCompleted === 0;
      const firstClearBonus = isFirstClear ? normalizeFirstClearBonus(stage.firstClearBonus) : 0;
      const nextStatus =
        existingProgress?.status === "starred" || starsEarned >= 3
          ? "starred"
          : "completed";
      const nextStarsEarned = Math.max(prevStarsEarned, starsEarned);

      await story.progress.upsertStageProgress(ctx, {
        userId: progressOwnerId,
        stageId: storyMatch.stageId,
        chapterId: storyMatch.chapterId,
        stageNumber: storyMatch.stageNumber,
        status: nextStatus,
        starsEarned: nextStarsEarned,
        timesCompleted: prevTimesCompleted + 1,
        firstClearClaimed: isFirstClear || prevFirstClearClaimed,
        lastCompletedAt: Date.now(),
      });
      if (chapter) {
        await updateCompletedChapterProgress(ctx, progressOwnerId, storyMatch.chapterId, chapter);
      }

      await story.progress.recordBattleAttempt(ctx, {
        userId: progressOwnerId,
        progressId: chapterProgressId,
        actNumber: chapter.actNumber ?? 0,
        chapterNumber: chapter.chapterNumber ?? 0,
        difficulty: STORY_DEFAULT_DIFFICULTY,
        outcome: "won",
        starsEarned: nextStarsEarned,
        finalLP,
        rewardsEarned: {
          gold: rewardGold,
          xp: rewardXp,
          cards: [],
        },
      });

      await ctx.db.patch(storyMatch._id, {
        outcome: outcome as "won" | "lost",
        starsEarned,
        rewardsGold: rewardGold,
        rewardsXp: rewardXp,
        firstClearBonus,
        completedAt: Date.now(),
      });

      return {
        outcome,
        starsEarned,
        rewards: {
          gold: rewardGold,
          xp: rewardXp,
          firstClearBonus,
        },
      };
    } else {
      await story.progress.recordBattleAttempt(ctx, {
        userId: progressOwnerId,
        progressId: chapterProgressId,
        actNumber: chapter.actNumber ?? 0,
        chapterNumber: chapter.chapterNumber ?? 0,
        difficulty: STORY_DEFAULT_DIFFICULTY,
        outcome: "lost",
        starsEarned: 0,
        finalLP,
        rewardsEarned: {
          gold: 0,
          xp: 0,
          cards: [],
        },
      });
    }

    await ctx.db.patch(storyMatch._id, {
      outcome: outcome as "won" | "lost",
      starsEarned,
      rewardsGold: rewardGold,
      rewardsXp: rewardXp,
      firstClearBonus: 0,
      completedAt: Date.now(),
    });

    return {
      outcome,
      starsEarned,
      rewards: {
        gold: rewardGold,
        xp: rewardXp,
        firstClearBonus: 0,
      },
    };
  },
});
