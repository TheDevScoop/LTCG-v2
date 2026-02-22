import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { components } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./auth";
import { LTCGCards } from "@lunchtable/cards";
import { LTCGMatch } from "@lunchtable/match";
import { LTCGStory } from "@lunchtable/story";
import { createInitialState, DEFAULT_CONFIG, buildCardLookup, parseCSVAbilities } from "@lunchtable/engine";
import type { Command } from "@lunchtable/engine";
import { DECK_RECIPES, STARTER_DECKS } from "./cardData";
import { buildPublicEventLog, buildPublicSpectatorView } from "./publicSpectator";
import { isPlainObject, normalizeGameCommand } from "./agentRouteHelpers";

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
const vPvpLobbyVisibility = v.union(v.literal("public"), v.literal("private"));
const vPvpLobbyStatus = v.union(
  v.literal("waiting"),
  v.literal("active"),
  v.literal("ended"),
  v.literal("canceled"),
);
const vPvpLobbySummary = v.object({
  matchId: v.string(),
  hostUserId: v.string(),
  hostUsername: v.string(),
  visibility: vPvpLobbyVisibility,
  joinCode: v.union(v.string(), v.null()),
  status: vPvpLobbyStatus,
  createdAt: v.number(),
  activatedAt: v.union(v.number(), v.null()),
  endedAt: v.union(v.number(), v.null()),
  pongEnabled: v.boolean(),
  redemptionEnabled: v.boolean(),
});
const vPvpCreateResult = v.object({
  matchId: v.string(),
  visibility: vPvpLobbyVisibility,
  joinCode: v.union(v.string(), v.null()),
  status: v.literal("waiting"),
  createdAt: v.number(),
});
const vPvpJoinResult = v.object({
  matchId: v.string(),
  seat: v.literal("away"),
  mode: v.literal("pvp"),
  status: v.literal("active"),
});
const vOpenStoryLobbySummary = v.object({
  matchId: v.string(),
  chapterId: v.string(),
  stageNumber: v.number(),
});
const vPublicEventLogEntry = v.object({
  version: v.number(),
  createdAt: v.union(v.number(), v.null()),
  actor: v.union(v.literal("agent"), v.literal("opponent"), v.literal("system")),
  eventType: v.string(),
  summary: v.string(),
  rationale: v.string(),
});

// ── Level formula ──────────────────────────────────────────────────
// level 1 at 0xp, level 2 at 100xp, level 3 at 400xp, level 4 at 900xp, etc.
const calculateLevel = (xp: number): number =>
  Math.floor(Math.sqrt(xp / 100)) + 1;

const DEFAULT_PLAYER_STATS = {
  gold: 0,
  xp: 0,
  level: 1,
  totalWins: 0,
  totalLosses: 0,
  pvpWins: 0,
  pvpLosses: 0,
  storyWins: 0,
  currentStreak: 0,
  bestStreak: 0,
  totalMatchesPlayed: 0,
  dailyLoginStreak: 0,
} as const;

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

const buildDeckSeedPart = (deck: ReadonlyArray<string> | null | undefined): string => {
  if (!Array.isArray(deck) || deck.length === 0) return "0:0";
  const normalized = deck.map((cardId) => String(cardId)).join(",");
  return `${deck.length}:${buildDeterministicSeed(normalized)}`;
};

const resolveDefaultStarterDeckCode = () => {
  const configured = STARTER_DECKS.find((deck) => DECK_RECIPES[deck.deckCode]);
  if (configured?.deckCode) return configured.deckCode;
  const keys = Object.keys(DECK_RECIPES);
  return keys[0] ?? null;
};

const CARD_LOOKUP_CACHE_TTL_MS = 60_000;
const AI_TURN_QUEUE_DEDUPE_MS = 5_000;
const PVP_JOIN_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PVP_JOIN_CODE_LENGTH = 6;
const PVP_JOIN_ATTEMPT_WINDOW_MS = 60_000;
const PVP_JOIN_ATTEMPT_LIMIT = 12;
const pvpJoinAttemptsByUser = new Map<string, number[]>();

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

function generateJoinCode() {
  let code = "";
  for (let index = 0; index < PVP_JOIN_CODE_LENGTH; index += 1) {
    const randomIndex = secureRandomIndex(PVP_JOIN_CODE_CHARS.length);
    code += PVP_JOIN_CODE_CHARS[randomIndex] ?? "A";
  }
  return code;
}

function secureRandomIndex(maxExclusive: number): number {
  if (!Number.isFinite(maxExclusive) || maxExclusive <= 1) return 0;
  const bytes = new Uint32Array(1);
  const maxUint32 = 0x1_0000_0000;
  const biasLimit = Math.floor(maxUint32 / maxExclusive) * maxExclusive;

  while (true) {
    crypto.getRandomValues(bytes);
    const value = bytes[0] ?? 0;
    if (value < biasLimit) {
      return value % maxExclusive;
    }
  }
}

async function generateUniqueJoinCode(ctx: any): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generateJoinCode();
    const existing = await ctx.db
      .query("pvpLobbies")
      .withIndex("by_joinCode", (q: any) => q.eq("joinCode", candidate))
      .first();
    if (!existing) return candidate;
  }
  throw new ConvexError("Failed to generate a unique join code. Please try again.");
}

function enforceJoinCodeAttemptRateLimit(userId: string): void {
  const now = Date.now();
  const windowStart = now - PVP_JOIN_ATTEMPT_WINDOW_MS;
  const existingAttempts = pvpJoinAttemptsByUser.get(userId) ?? [];
  const recentAttempts = existingAttempts.filter((attemptedAt) => attemptedAt >= windowStart);

  if (recentAttempts.length >= PVP_JOIN_ATTEMPT_LIMIT) {
    throw new ConvexError("Too many join code attempts. Please wait a moment and try again.");
  }

  recentAttempts.push(now);
  pvpJoinAttemptsByUser.set(userId, recentAttempts);
}

function normalizePvpLobbySummary(row: any) {
  return {
    matchId: String(row.matchId),
    hostUserId: String(row.hostUserId),
    hostUsername: String(row.hostUsername),
    visibility: row.visibility === "private" ? "private" : "public",
    joinCode: typeof row.joinCode === "string" ? row.joinCode : null,
    status:
      row.status === "active" ||
      row.status === "ended" ||
      row.status === "canceled"
        ? row.status
        : "waiting",
    createdAt: Number(row.createdAt ?? Date.now()),
    activatedAt:
      typeof row.activatedAt === "number" && Number.isFinite(row.activatedAt)
        ? row.activatedAt
        : null,
    endedAt:
      typeof row.endedAt === "number" && Number.isFinite(row.endedAt)
        ? row.endedAt
        : null,
    pongEnabled: row.pongEnabled === true,
    redemptionEnabled: row.redemptionEnabled === true,
  } as const;
}

async function getPvpLobbyByMatchId(ctx: any, matchId: string) {
  return ctx.db
    .query("pvpLobbies")
    .withIndex("by_matchId", (q: any) => q.eq("matchId", matchId))
    .first();
}

async function activatePvpLobbyOnJoin(ctx: any, matchId: string) {
  const lobby = await getPvpLobbyByMatchId(ctx, matchId);
  if (!lobby || lobby.status !== "waiting") return;
  await ctx.db.patch(lobby._id, {
    status: "active",
    activatedAt: Date.now(),
  });
}

async function joinPvpLobbyInternal(ctx: any, args: { matchId: string; awayUserId: string }) {
  const lobby = await getPvpLobbyByMatchId(ctx, args.matchId);
  if (!lobby) {
    throw new ConvexError("PvP lobby not found.");
  }
  if (lobby.status !== "waiting") {
    throw new ConvexError(`Lobby is not joinable (status: ${lobby.status}).`);
  }
  if (lobby.hostUserId === args.awayUserId) {
    throw new ConvexError("Cannot join your own lobby.");
  }

  const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
  if (!meta) {
    throw new ConvexError("Match not found.");
  }
  if ((meta as any).mode !== "pvp") {
    throw new ConvexError("Lobby match is not a PvP match.");
  }
  if ((meta as any).status !== "waiting") {
    throw new ConvexError(`Match is not waiting (status: ${(meta as any).status}).`);
  }
  if ((meta as any).awayId !== null) {
    throw new ConvexError("Match already has an away player.");
  }

  const awayUser = await ctx.db.get(args.awayUserId);
  if (!awayUser) {
    throw new ConvexError("Away player not found.");
  }

  const hostDeck = Array.isArray((meta as any).hostDeck) ? (meta as any).hostDeck : [];
  if (hostDeck.length < 30) {
    throw new ConvexError("Host deck is invalid or too small.");
  }

  const { deckData } = await resolveActiveDeckForStory(ctx, awayUser);
  const awayDeck = getDeckCardIdsFromDeckData(deckData);
  if (!Array.isArray(awayDeck) || awayDeck.length < 30) {
    throw new ConvexError("Your deck must have at least 30 cards.");
  }

  const allCards = await getCachedCardDefinitions(ctx);
  const cardLookup = buildCardLookup(allCards as any);
  const seed = buildMatchSeed([
    "pvpLobbyJoin",
    (meta as any).hostId,
    args.awayUserId,
    buildDeckSeedPart(hostDeck),
    buildDeckSeedPart(awayDeck),
  ]);
  const firstPlayer: "host" | "away" = seed % 2 === 0 ? "host" : "away";

  const lobbyConfig = {
    ...DEFAULT_CONFIG,
    pongEnabled: lobby.pongEnabled === true,
    redemptionEnabled: lobby.redemptionEnabled === true,
  };

  const initialState = createInitialState(
    cardLookup,
    lobbyConfig,
    (meta as any).hostId,
    args.awayUserId,
    hostDeck,
    awayDeck,
    firstPlayer,
    makeRng(seed),
  );

  await match.joinMatch(ctx, {
    matchId: args.matchId,
    awayId: args.awayUserId,
    awayDeck,
  });

  await match.startMatch(ctx, {
    matchId: args.matchId,
    initialState: JSON.stringify(initialState),
    configAllowlist: {
      pongEnabled: lobby.pongEnabled === true,
      redemptionEnabled: lobby.redemptionEnabled === true,
    },
  });

  await activatePvpLobbyOnJoin(ctx, args.matchId);

  // Schedule the first disconnect check after the timeout window
  await ctx.scheduler.runAfter(
    60_000 + 15_000, // give both players time to connect, then start checking
    internal.game.checkPvpDisconnect,
    { matchId: args.matchId },
  );

  return {
    matchId: args.matchId,
    seat: "away" as const,
    mode: "pvp" as const,
    status: "active" as const,
  };
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
  handler: async (ctx) => {
    const allCards = await cards.cards.getAllCards(ctx);
    return (allCards || []).map((card: any) => {
      const effects = parseCSVAbilities(card.ability);
      if (effects) {
        for (const eff of effects) {
          eff.id = `${card._id}:${eff.id}`;
        }
      }
      return { ...card, effects };
    });
  },
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
    const catalog = await getCachedCardDefinitions(ctx);

    // Map card name → canonical String(_id) from catalog
    // This guarantees output IDs match getCatalogCards._id format exactly
    const nameToCatalogId = new Map<string, string>();
    for (const def of catalog) {
      if (def?.name) nameToCatalogId.set(String(def.name), String(def._id));
    }

    return (userCards ?? [])
      .map((userCard: any) => {
        const name = String(userCard?.name ?? "");
        const catalogId = nameToCatalogId.get(name);
        return {
          cardDefinitionId: catalogId ?? String(userCard?.cardDefinitionId ?? ""),
          quantity: Number(userCard?.quantity ?? 0),
        };
      })
      .filter(
        (uc: { cardDefinitionId: string; quantity: number }) =>
          uc.cardDefinitionId.length > 0 && uc.quantity > 0,
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
    // Don't set empty deck as active — user must populate it first via saveDeck
    return deckId;
  },
});

export const saveDeck = mutation({
  args: {
    deckId: v.string(),
    cards: v.array(v.object({ cardDefinitionId: v.string(), quantity: v.number() })),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return cards.decks.saveDeck(ctx, args.deckId, args.cards);
  },
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

// ── PvP Lobby / Matchmaking ───────────────────────────────────────

export const createPvpLobby = mutation({
  args: {
    visibility: v.optional(vPvpLobbyVisibility),
    pongEnabled: v.optional(v.boolean()),
    redemptionEnabled: v.optional(v.boolean()),
  },
  returns: vPvpCreateResult,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const visibility: "public" | "private" =
      args.visibility === "private" ? "private" : "public";
    const now = Date.now();

    const existing = await ctx.db
      .query("pvpLobbies")
      .withIndex("by_hostUserId", (q: any) => q.eq("hostUserId", user._id))
      .collect();
    const existingWaiting = existing.some((row: any) => row.status === "waiting");
    if (existingWaiting) {
      throw new ConvexError("You already have a waiting PvP lobby. Join or cancel it first.");
    }

    const { deckData } = await resolveActiveDeckForStory(ctx, user);
    const hostDeck = getDeckCardIdsFromDeckData(deckData);
    if (hostDeck.length < 30) {
      throw new ConvexError("Deck must have at least 30 cards.");
    }

    const matchId = await match.createMatch(ctx, {
      hostId: user._id,
      mode: "pvp",
      hostDeck,
      isAIOpponent: false,
    });

    const joinCode = visibility === "private" ? await generateUniqueJoinCode(ctx) : null;
    const lobbyDoc: Record<string, unknown> = {
      matchId,
      mode: "pvp",
      hostUserId: user._id,
      hostUsername:
        typeof (user as any).username === "string" && (user as any).username.trim()
          ? String((user as any).username)
          : "Player",
      visibility,
      status: "waiting",
      createdAt: now,
      pongEnabled: args.pongEnabled === true,
      redemptionEnabled: args.redemptionEnabled === true,
    };
    if (joinCode) {
      lobbyDoc.joinCode = joinCode;
    }

    await ctx.db.insert("pvpLobbies", lobbyDoc as any);

    return {
      matchId: String(matchId),
      visibility,
      joinCode,
      status: "waiting" as const,
      createdAt: now,
    };
  },
});

export const listOpenPvpLobbies = query({
  args: {},
  returns: v.array(vPvpLobbySummary),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const waitingRows = await ctx.db
      .query("pvpLobbies")
      .withIndex("by_status", (q: any) => q.eq("status", "waiting"))
      .collect();

    const output: Array<ReturnType<typeof normalizePvpLobbySummary>> = [];
    for (const row of waitingRows) {
      if (row.visibility !== "public") continue;
      if (row.hostUserId === user._id) continue;

      const meta = await match.getMatchMeta(ctx, { matchId: row.matchId });
      if (!meta) continue;
      if ((meta as any).status !== "waiting") continue;
      if ((meta as any).awayId !== null) continue;

      output.push(normalizePvpLobbySummary(row));
    }

    output.sort((a, b) => b.createdAt - a.createdAt);
    return output;
  },
});

export const getMyPvpLobby = query({
  args: {},
  returns: v.union(vPvpLobbySummary, v.null()),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("pvpLobbies")
      .withIndex("by_hostUserId", (q: any) => q.eq("hostUserId", user._id))
      .collect();

    if (rows.length === 0) return null;

    rows.sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt));

    for (const row of rows) {
      const meta = await match.getMatchMeta(ctx, { matchId: row.matchId });
      if (!meta) continue;
      const derivedStatus =
        (meta as any).status === "active" || (meta as any).status === "ended"
          ? (meta as any).status
          : row.status;
      if (derivedStatus !== "waiting" && derivedStatus !== "active") continue;

      return normalizePvpLobbySummary({
        ...row,
        status: derivedStatus,
      });
    }

    return null;
  },
});

export const joinPvpLobby = mutation({
  args: {
    matchId: v.string(),
    joinCode: v.optional(v.string()),
  },
  returns: vPvpJoinResult,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const lobby = await getPvpLobbyByMatchId(ctx, args.matchId);
    if (!lobby) {
      throw new ConvexError("PvP lobby not found.");
    }
    if (lobby.visibility === "private") {
      const supplied = typeof args.joinCode === "string" ? args.joinCode.trim().toUpperCase() : "";
      if (!supplied || supplied !== String(lobby.joinCode ?? "").toUpperCase()) {
        throw new ConvexError("Invalid private lobby join code.");
      }
    }

    return joinPvpLobbyInternal(ctx, {
      matchId: args.matchId,
      awayUserId: user._id,
    });
  },
});

export const joinPvpLobbyByCode = mutation({
  args: {
    joinCode: v.string(),
  },
  returns: vPvpJoinResult,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    enforceJoinCodeAttemptRateLimit(String(user._id));
    const normalizedCode = args.joinCode.trim().toUpperCase();
    if (!normalizedCode || normalizedCode.length !== PVP_JOIN_CODE_LENGTH) {
      throw new ConvexError("Join code must be a 6-character code.");
    }

    const rows = await ctx.db
      .query("pvpLobbies")
      .withIndex("by_joinCode", (q: any) => q.eq("joinCode", normalizedCode))
      .collect();
    const waiting = rows
      .filter((row: any) => row.status === "waiting")
      .sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt))[0];

    if (!waiting) {
      throw new ConvexError("No waiting lobby found for that code.");
    }

    return joinPvpLobbyInternal(ctx, {
      matchId: String(waiting.matchId),
      awayUserId: user._id,
    });
  },
});

export const cancelPvpLobby = mutation({
  args: { matchId: v.string() },
  returns: v.object({
    matchId: v.string(),
    canceled: v.boolean(),
    status: v.literal("canceled"),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const lobby = await getPvpLobbyByMatchId(ctx, args.matchId);
    if (!lobby) {
      throw new ConvexError("PvP lobby not found.");
    }
    if (lobby.hostUserId !== user._id) {
      throw new ConvexError("Only the lobby host can cancel this lobby.");
    }
    if (lobby.status !== "waiting") {
      throw new ConvexError(`Lobby is not cancelable (status: ${lobby.status}).`);
    }

    await match.cancelMatch(ctx, { matchId: args.matchId });

    await ctx.db.patch(lobby._id, {
      status: "canceled",
      endedAt: Date.now(),
    });

    return {
      matchId: args.matchId,
      canceled: true,
      status: "canceled" as const,
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
  if (!deckData) return [];
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
      buildDeckSeedPart(playerDeck),
      buildDeckSeedPart(aiDeck),
    ]);
    const firstPlayer: "host" | "away" = seed % 2 === 0 ? "host" : "away";

    const initialState = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      user._id,
      "cpu",
      playerDeck,
      aiDeck,
      firstPlayer,
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
      awayId: undefined,
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

export const getMyOpenStoryLobby = query({
  args: {},
  returns: v.union(vOpenStoryLobbySummary, v.null()),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const lobby = await match.getOpenLobbyByHost(ctx, { hostId: user._id });
    if (!lobby || (lobby as any).mode !== "story") {
      return null;
    }

    const storyMatch = await ctx.db
      .query("storyMatches")
      .withIndex("by_matchId", (q: any) => q.eq("matchId", lobby.matchId))
      .first();
    if (!storyMatch) return null;

    return {
      matchId: lobby.matchId,
      chapterId: storyMatch.chapterId,
      stageNumber: storyMatch.stageNumber,
    };
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

    await match.cancelMatch(ctx, { matchId: args.matchId });

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

function dedupeEventBatchesByVersion<T extends { version?: number }>(batches: T[]): T[] {
  const seenVersions = new Set<number>();
  const deduped: T[] = [];
  for (const batch of batches) {
    const version = typeof batch?.version === "number" ? batch.version : null;
    if (version === null || seenVersions.has(version)) continue;
    seenVersions.add(version);
    deduped.push(batch);
  }
  return deduped;
}

async function resolveActor(
  ctx: any,
  actorUserId?: string,
  dependencies?: {
    getUserById?: (ctx: any, actorUserId: string) => Promise<{ _id: string } | null>;
    requireUserFn?: (ctx: any) => Promise<{ _id: string }>;
  },
) {
  const getUserById =
    dependencies?.getUserById ??
    (async (innerCtx: any, userId: string) => innerCtx.db.get(userId as any));
  const requireUserFn = dependencies?.requireUserFn ?? requireUser;

  if (actorUserId) {
    const actor = await getUserById(ctx, actorUserId);
    if (!actor) {
      throw new Error("Actor user not found.");
    }
    return actor;
  }
  return requireUserFn(ctx);
}

async function assertActorMatchesAuthenticatedUser(
  ctx: any,
  actorUserId?: string,
  dependencies?: {
    requireUserFn?: (ctx: any) => Promise<{ _id: string }>;
  },
) {
  const requireUserFn = dependencies?.requireUserFn ?? requireUser;
  const user = await requireUserFn(ctx);
  if (actorUserId && String(actorUserId) !== user._id) {
    throw new Error("actorUserId must match authenticated user.");
  }
  return user;
}

function resolveSeatForUser(meta: any, userId: string): "host" | "away" | null {
  if (!meta || !userId) return null;
  if ((meta as any)?.hostId === userId) return "host";
  if ((meta as any)?.awayId === userId) return "away";
  return null;
}

async function requireMatchParticipant(
  ctx: any,
  matchId: string,
  seat?: "host" | "away",
  actorUserId?: string,
  dependencies?: {
    resolveActorFn?: (
      ctx: any,
      actorUserId?: string,
    ) => Promise<{ _id: string }>;
    getMatchMetaFn?: (
      ctx: any,
      matchId: string,
    ) => Promise<{ hostId?: string | null; awayId?: string | null } | null>;
  },
) {
  const resolveActorFn = dependencies?.resolveActorFn ?? resolveActor;
  const getMatchMetaFn =
    dependencies?.getMatchMetaFn ??
    (async (innerCtx: any, innerMatchId: string) =>
      match.getMatchMeta(innerCtx, { matchId: innerMatchId }));

  const actor = await resolveActorFn(ctx, actorUserId);
  const meta = await getMatchMetaFn(ctx, matchId);
  if (!meta) {
    throw new Error("Match not found.");
  }

  const participantSeat = resolveSeatForUser(meta, actor._id);
  if (!participantSeat) {
    throw new Error("You are not a participant in this match.");
  }
  if (seat && participantSeat !== seat) {
    throw new Error("Seat does not match the authenticated player.");
  }

  return { actor, meta, seat: participantSeat };
}

function assertStoryMatchRequesterAuthorized(
  storyMatch: { userId: string },
  requesterUserId: string,
  meta: { hostId?: string | null; awayId?: string | null } | null,
) {
  if (storyMatch.userId === requesterUserId) {
    return;
  }

  const requesterSeat = resolveSeatForUser(meta, requesterUserId);
  if (!requesterSeat) {
    throw new Error("Not your match");
  }
}

export const __test = {
  resolveActor,
  assertActorMatchesAuthenticatedUser,
  requireMatchParticipant,
  assertStoryMatchRequesterAuthorized,
  resolveLegacyCommandPayload,
  resetPvpJoinCodeRateLimiter: () => {
    pvpJoinAttemptsByUser.clear();
  },
};

async function requireSeatOwnership(
  ctx: any,
  matchId: string,
  seat: "host" | "away",
  actorUserId: string,
) {
  const meta = await match.getMatchMeta(ctx, { matchId });
  if (!meta) {
    throw new ConvexError("Match not found.");
  }

  const resolvedSeat = resolveSeatForUser(meta, actorUserId);
  if (!resolvedSeat) {
    throw new ConvexError("You are not a participant in this match.");
  }
  if (resolvedSeat !== seat) {
    throw new ConvexError("You can only access your own seat.");
  }

  return meta;
}

const HIDDEN_SETUP_COMMAND_TYPES = new Set(["SET_MONSTER", "SET_SPELL_TRAP"]);

function normalizeSeat(value: unknown): "host" | "away" | null {
  if (value === "host" || value === "away") return value;
  return null;
}

function normalizeCommandForViewer(
  command: unknown,
  sourceSeat: "host" | "away" | null,
  viewerSeat: "host" | "away",
): string {
  if (typeof command !== "string") {
    return JSON.stringify({ type: "UNKNOWN" });
  }

  let parsedCommand: unknown;
  try {
    parsedCommand = JSON.parse(command);
  } catch {
    return JSON.stringify({ type: "UNKNOWN" });
  }

  if (!parsedCommand || typeof parsedCommand !== "object" || Array.isArray(parsedCommand)) {
    return JSON.stringify({ type: "UNKNOWN" });
  }

  const commandType = typeof (parsedCommand as { type?: unknown }).type === "string"
    ? (parsedCommand as { type: string }).type
    : null;

  if (!commandType) {
    return JSON.stringify({ type: "UNKNOWN" });
  }

  if (sourceSeat && sourceSeat !== viewerSeat && HIDDEN_SETUP_COMMAND_TYPES.has(commandType)) {
    return JSON.stringify({ type: commandType });
  }

  return command;
}

function redactRecentEventCommands(
  batches: Array<Record<string, unknown>>,
  viewerSeat: "host" | "away",
) {
  return batches.map((batch) => {
    const sourceSeat = normalizeSeat(batch.seat);
    return {
      ...batch,
      command: normalizeCommandForViewer(batch.command, sourceSeat, viewerSeat),
    };
  });
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function getCardIdList(zone: unknown): string[] {
  if (!Array.isArray(zone)) return [];
  return zone
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      return typeof entry.cardId === "string" ? entry.cardId : null;
    })
    .filter((entry): entry is string => typeof entry === "string");
}

function getSingleCardId(card: unknown): string[] {
  if (!isPlainObject(card)) return [];
  if (typeof card.cardId === "string") return [card.cardId];
  return [];
}

function getInstanceDefinitionMap(view: unknown): Record<string, string> {
  if (!isPlainObject(view) || !isPlainObject(view.instanceDefinitions)) {
    return {};
  }

  const map: Record<string, string> = {};
  for (const [instanceId, definitionId] of Object.entries(view.instanceDefinitions)) {
    if (typeof definitionId === "string") {
      map[instanceId] = definitionId;
    }
  }
  return map;
}

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function collectCommandResolutionZones(view: unknown) {
  const hand = isPlainObject(view) ? toStringArray(view.hand) : [];
  const myBoard = isPlainObject(view) ? getCardIdList(view.board) : [];
  const mySpellTrap = isPlainObject(view) ? getCardIdList(view.spellTrapZone) : [];
  const myField = isPlainObject(view) ? getSingleCardId(view.fieldSpell) : [];
  const myGraveyard = isPlainObject(view) ? toStringArray(view.graveyard) : [];
  const myBanished = isPlainObject(view) ? toStringArray(view.banished) : [];

  const opponentBoard = isPlainObject(view) ? getCardIdList(view.opponentBoard) : [];
  const opponentSpellTrap = isPlainObject(view) ? getCardIdList(view.opponentSpellTrapZone) : [];
  const opponentField = isPlainObject(view) ? getSingleCardId(view.opponentFieldSpell) : [];
  const opponentGraveyard = isPlainObject(view) ? toStringArray(view.opponentGraveyard) : [];
  const opponentBanished = isPlainObject(view) ? toStringArray(view.opponentBanished) : [];

  const myBoardLike = dedupeIds([...myBoard, ...mySpellTrap, ...myField]);
  const allBoardLike = dedupeIds([
    ...myBoardLike,
    ...opponentBoard,
    ...opponentSpellTrap,
    ...opponentField,
  ]);
  const allVisible = dedupeIds([
    ...hand,
    ...allBoardLike,
    ...myGraveyard,
    ...opponentGraveyard,
    ...myBanished,
    ...opponentBanished,
  ]);

  return {
    hand,
    myBoardLike,
    opponentBoard,
    allBoardLike,
    allVisible,
  };
}

function resolveLegacyCardId(
  rawId: string,
  options: {
    definitionMap: Record<string, string>;
    candidateIds: string[];
    resolveMode: "deterministic" | "unique";
    fieldName: string;
    commandType: string;
  },
): string {
  if (!rawId) return rawId;
  if (options.definitionMap[rawId]) return rawId;

  const matches = options.candidateIds.filter((instanceId) => {
    return (
      instanceId === rawId ||
      options.definitionMap[instanceId] === rawId
    );
  });

  if (matches.length === 0) {
    return rawId;
  }

  if (options.resolveMode === "deterministic") {
    return matches[0]!;
  }

  if (matches.length > 1) {
    throw new ConvexError(
      `Ambiguous legacy ${options.fieldName} "${rawId}" for ${options.commandType}; use canonical instance ID.`,
    );
  }

  return matches[0]!;
}

function resolveLegacyCommandPayload(
  commandJson: string,
  viewJson: string | null,
): string {
  let parsedCommand: unknown;
  try {
    parsedCommand = JSON.parse(commandJson);
  } catch {
    throw new ConvexError("command must be valid JSON.");
  }

  const normalizedCommand = normalizeGameCommand(parsedCommand);
  if (!isPlainObject(normalizedCommand)) {
    throw new ConvexError("command must be an object.");
  }

  const command = { ...normalizedCommand } as Record<string, unknown>;
  const commandType = typeof command.type === "string" ? command.type : null;
  if (!commandType) {
    throw new ConvexError("command.type is required.");
  }

  let parsedView: unknown = null;
  if (typeof viewJson === "string") {
    try {
      parsedView = JSON.parse(viewJson);
    } catch {
      parsedView = null;
    }
  }

  const definitionMap = getInstanceDefinitionMap(parsedView);
  const zones = collectCommandResolutionZones(parsedView);

  const resolveFromHand = (value: unknown, fieldName: string): string | undefined => {
    if (typeof value !== "string") return undefined;
    return resolveLegacyCardId(value, {
      definitionMap,
      candidateIds: zones.hand,
      resolveMode: "deterministic",
      fieldName,
      commandType,
    });
  };

  const resolveBoardLike = (value: unknown, fieldName: string): string | undefined => {
    if (typeof value !== "string") return undefined;
    return resolveLegacyCardId(value, {
      definitionMap,
      candidateIds: zones.allBoardLike,
      resolveMode: "unique",
      fieldName,
      commandType,
    });
  };

  const resolveOpponentBoard = (value: unknown, fieldName: string): string | undefined => {
    if (typeof value !== "string") return undefined;
    return resolveLegacyCardId(value, {
      definitionMap,
      candidateIds: zones.opponentBoard,
      resolveMode: "unique",
      fieldName,
      commandType,
    });
  };

  const resolveAnyVisibleTarget = (value: unknown, fieldName: string): string | undefined => {
    if (typeof value !== "string") return undefined;
    return resolveLegacyCardId(value, {
      definitionMap,
      candidateIds: zones.allVisible,
      resolveMode: "unique",
      fieldName,
      commandType,
    });
  };

  const resolveTargets = (fieldName: string) => {
    if (!Array.isArray(command.targets)) return;
    command.targets = command.targets.map((target, index) => {
      if (typeof target !== "string") return target;
      return resolveAnyVisibleTarget(target, `${fieldName}[${index}]`) ?? target;
    });
  };

  switch (commandType) {
    case "SUMMON":
    case "SET_MONSTER":
    case "SET_SPELL_TRAP": {
      const resolved = resolveFromHand(command.cardId, "cardId");
      if (resolved) command.cardId = resolved;
      break;
    }

    case "ACTIVATE_SPELL": {
      const rawCardId = typeof command.cardId === "string" ? command.cardId : null;
      if (rawCardId) {
        const resolvedFromHand = resolveFromHand(rawCardId, "cardId");
        if (resolvedFromHand && resolvedFromHand !== rawCardId) {
          command.cardId = resolvedFromHand;
        } else {
          const resolvedBoard = resolveBoardLike(rawCardId, "cardId");
          if (resolvedBoard) command.cardId = resolvedBoard;
        }
      }
      resolveTargets("targets");
      break;
    }

    case "ACTIVATE_TRAP":
    case "ACTIVATE_EFFECT":
    case "FLIP_SUMMON":
    case "CHANGE_POSITION": {
      const resolved = resolveBoardLike(command.cardId, "cardId");
      if (resolved) command.cardId = resolved;
      resolveTargets("targets");
      break;
    }

    case "DECLARE_ATTACK": {
      const attackerId = resolveBoardLike(command.attackerId, "attackerId");
      if (attackerId) command.attackerId = attackerId;

      if (typeof command.targetId === "string") {
        const targetId = resolveOpponentBoard(command.targetId, "targetId");
        if (targetId) command.targetId = targetId;
      }
      break;
    }

    case "CHAIN_RESPONSE": {
      const resolvedCardId = resolveBoardLike(command.cardId, "cardId");
      if (resolvedCardId) command.cardId = resolvedCardId;
      const resolvedSourceCardId = resolveBoardLike(command.sourceCardId, "sourceCardId");
      if (resolvedSourceCardId) command.sourceCardId = resolvedSourceCardId;
      resolveTargets("targets");
      break;
    }

    default: {
      resolveTargets("targets");
      break;
    }
  }

  return JSON.stringify(command);
}

async function submitActionForActor(
  ctx: any,
  args: {
    matchId: string;
    command: string;
    seat: "host" | "away";
    expectedVersion?: number;
    actorUserId: string;
  },
) {
  await requireSeatOwnership(ctx, args.matchId, args.seat, args.actorUserId);

  const rawView = await match.getPlayerView(ctx, {
    matchId: args.matchId,
    seat: args.seat,
  });
  const resolvedCommand = resolveLegacyCommandPayload(
    args.command,
    typeof rawView === "string" ? rawView : null,
  );

  const result = await match.submitAction(ctx, {
    matchId: args.matchId,
    command: resolvedCommand,
    seat: args.seat,
    expectedVersion: args.expectedVersion,
  });

  // Schedule AI turn only if: game is active, it's an AI match, and
  // this was the human action (i.e., not AI seat) that didn't end the game.
  const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
  const aiSeat = resolveAICupSeat(meta);
  if (
    (meta as any)?.status === "active" &&
    aiSeat &&
    (meta as any)?.isAIOpponent &&
    args.seat !== aiSeat
  ) {
    let events: any[] = [];
    try {
      events = JSON.parse(result.events);
    } catch {
      events = [];
    }
    const gameOver = events.some((e: any) => e.type === "GAME_ENDED");
    if (!gameOver) {
      const queued = await queueAITurn(ctx, args.matchId);
      if (queued) {
        await ctx.scheduler.runAfter(500, internal.game.executeAITurn, {
          matchId: args.matchId,
        });
      }
    }
  }

  // Check if the game just ended — if so, complete PvP match processing.
  // Prefer explicit GAME_ENDED in returned events, but also fall back to match
  // meta status because GAME_ENDED can be produced by evolve() derived checks.
  {
    let parsedEvents: any[] = [];
    try {
      parsedEvents = JSON.parse(result.events);
    } catch {
      parsedEvents = [];
    }
    const gameOverFromEvents = parsedEvents.some((e: any) => e.type === "GAME_ENDED");
    const lobby = await ctx.db
      .query("pvpLobbies")
      .withIndex("by_matchId", (q: any) => q.eq("matchId", args.matchId))
      .first();
    if (lobby) {
      if (gameOverFromEvents) {
        await ctx.runMutation(internal.game.completePvpMatch, {
          matchId: args.matchId,
        });
      } else {
        const latestMeta = await match.getMatchMeta(ctx, { matchId: args.matchId });
        if (latestMeta && (latestMeta as any).status === "ended") {
          await ctx.runMutation(internal.game.completePvpMatch, {
            matchId: args.matchId,
          });
        }
      }
    }
  }

  return result;
}

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

// Public mutation used by the web frontend (includes a `client` tag for telemetry).
export const submitActionWithClient = mutation({
  args: {
    matchId: v.string(),
    command: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
    expectedVersion: v.optional(v.number()),
    client: v.optional(v.string()),
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

// Internal mutation used by Telegram HTTP handler (accepts userId directly).
export const submitActionWithClientForUser = internalMutation({
  args: {
    userId: v.id("users"),
    matchId: v.string(),
    command: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
    expectedVersion: v.optional(v.number()),
    client: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) =>
    submitActionForActor(ctx, {
      matchId: args.matchId,
      command: args.command,
      seat: args.seat,
      expectedVersion: args.expectedVersion,
      actorUserId: args.userId,
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
  const instanceDefinitions =
    typeof view?.instanceDefinitions === "object" && view.instanceDefinitions !== null
      ? (view.instanceDefinitions as Record<string, string>)
      : {};
  const resolveDefinitionId = (cardId: string) => instanceDefinitions[cardId] ?? cardId;

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
      .map((id: string) => ({ id, def: cardLookup[resolveDefinitionId(id)] }))
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
      .map((id: string) => ({ id, def: cardLookup[resolveDefinitionId(id)] }))
      .filter((c: any) => c.def?.cardType === "spell");
    if (spellsInHand.length > 0) {
      return {
        type: "ACTIVATE_SPELL",
        cardId: spellsInHand[0].id,
      };
    }

    // 3. Set spells/traps if backrow has space
    const spellsTrapsInHand = hand
      .map((id: string) => ({ id, def: cardLookup[resolveDefinitionId(id)] }))
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
  }

  // Combat phase — must be outside the main/main2 block
  if (phase === "combat") {
    const attackableMonsters = board.filter(
      (c: any) => !c.faceDown && c.canAttack && !c.hasAttackedThisTurn
    );

    if (attackableMonsters.length > 0) {
      const attacker = attackableMonsters[0];
      const attackerId = attacker?.cardId ?? attacker?.instanceId;
      if (!attackerId) return { type: "ADVANCE_PHASE" };

      // Direct attack only when opponent has no face-up monsters
      // (engine allows attacking past face-down monsters)
      const faceUpOpponents = opponentBoard.filter((c: any) => !c.faceDown);

      if (faceUpOpponents.length === 0) {
        return {
          type: "DECLARE_ATTACK",
          attackerId,
        };
      }

      // Attack weakest opponent monster by ATK
      let weakestOpponent = faceUpOpponents[0];
      let weakestAtk =
        (cardLookup[weakestOpponent.definitionId]?.attack ?? 0) +
        (weakestOpponent.temporaryBoosts?.attack ?? 0);

      for (const opp of faceUpOpponents) {
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

    // No attackers in combat — advance past combat
    return { type: "ADVANCE_PHASE" };
  }

  // Fallback: advance phase
  return { type: "ADVANCE_PHASE" };
}

// ── AI Turn ────────────────────────────────────────────────────────

/** AI action delay in ms between individual actions (visible pacing) */
const AI_ACTION_DELAY_MS = 1_500;
/** AI chain response delay (shorter, chains should feel snappy) */
const AI_CHAIN_DELAY_MS = 800;
/** Max actions per AI turn to prevent infinite loops */
const AI_MAX_ACTIONS = 20;

export const executeAITurn = internalMutation({
  args: {
    matchId: v.string(),
    stepsRemaining: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stepsLeft = args.stepsRemaining ?? AI_MAX_ACTIONS;

    // First call: claim from queue to prevent duplicate scheduling.
    // Continuation calls (stepsLeft < AI_MAX_ACTIONS) skip the queue check.
    if (stepsLeft === AI_MAX_ACTIONS) {
      const claimed = await claimQueuedAITurn(ctx, args.matchId);
      if (!claimed) return null;
    }

    if (stepsLeft <= 0) return null;

    // Guard: check it's still AI's turn before acting.
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    const aiSeat = resolveAICupSeat(meta);
    if ((meta as any)?.status !== "active" || !aiSeat) return null;

    let viewJson: string | null = null;
    try {
      viewJson = await match.getPlayerView(ctx, {
        matchId: args.matchId,
        seat: aiSeat,
      });
    } catch {
      return null;
    }
    if (!viewJson) return null;

    let view: any;
    try {
      view = JSON.parse(viewJson);
    } catch {
      return null;
    }

    // Stop if game is over or no longer AI's turn
    if (view.gameOver || view.currentTurnPlayer !== aiSeat) return null;

    // Chain handling: only respond if AI has priority
    if (Array.isArray(view.currentChain) && view.currentChain.length > 0) {
      if (view.currentPriorityPlayer !== aiSeat) {
        // Human player has chain priority — stop and let them respond.
        // The human's action will re-trigger queueAITurn when done.
        return null;
      }

      try {
        await match.submitAction(ctx, {
          matchId: args.matchId,
          command: JSON.stringify({ type: "CHAIN_RESPONSE", pass: true }),
          seat: aiSeat,
        });
      } catch {
        return null;
      }

      // Schedule next step with shorter delay for chain resolution
      await ctx.scheduler.runAfter(AI_CHAIN_DELAY_MS, internal.game.executeAITurn, {
        matchId: args.matchId,
        stepsRemaining: stepsLeft - 1,
      });
      return null;
    }

    // Pick and execute ONE action
    const cardLookup = await getCachedCardLookup(ctx);
    const command = pickAICommand(view, cardLookup);

    try {
      await match.submitAction(ctx, {
        matchId: args.matchId,
        command: JSON.stringify(command),
        seat: aiSeat,
      });
    } catch {
      return null;
    }

    // If command was END_TURN, stop
    if (command.type === "END_TURN") return null;

    // Schedule next action with visible delay
    await ctx.scheduler.runAfter(AI_ACTION_DELAY_MS, internal.game.executeAITurn, {
      matchId: args.matchId,
      stepsRemaining: stepsLeft - 1,
    });
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

export const getPublicPlayerViewAsActor = internalQuery({
  args: {
    matchId: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
    actorUserId: v.id("users"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const meta = await requireSeatOwnership(ctx, args.matchId, args.seat, args.actorUserId);
    const rawView = await match.getPlayerView(ctx, {
      matchId: args.matchId,
      seat: args.seat,
    });
    if (!rawView) return null;

    let parsedView: Record<string, unknown>;
    try {
      parsedView = JSON.parse(rawView) as Record<string, unknown>;
    } catch {
      throw new ConvexError("Failed to parse player view.");
    }

    const storyMatch = await ctx.db
      .query("storyMatches")
      .withIndex("by_matchId", (q: any) => q.eq("matchId", args.matchId))
      .first();
    const cardLookup = await getCachedCardLookup(ctx);

    return buildPublicSpectatorView({
      matchId: args.matchId,
      seat: args.seat,
      status: typeof (meta as any)?.status === "string" ? (meta as any).status : null,
      mode: typeof (meta as any)?.mode === "string" ? (meta as any).mode : null,
      chapterId: typeof storyMatch?.chapterId === "string" ? storyMatch.chapterId : null,
      stageNumber: typeof storyMatch?.stageNumber === "number" ? storyMatch.stageNumber : null,
      view: parsedView,
      cardLookup,
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
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { meta } = await requireMatchParticipant(ctx, args.matchId, undefined, user._id);
    return meta;
  },
});

export const getMatchMetaAsActor = internalQuery({
  args: {
    matchId: v.string(),
    actorUserId: v.id("users"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { meta } = await requireMatchParticipant(
      ctx,
      args.matchId,
      undefined,
      args.actorUserId,
    );
    return meta;
  },
});

export const getRecentEvents = query({
  args: { matchId: v.string(), sinceVersion: v.number() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { seat } = await requireMatchParticipant(ctx, args.matchId, undefined, user._id);
    const batches = await match.getRecentEvents(ctx, args);
    const normalizedBatches = dedupeEventBatchesByVersion(Array.isArray(batches) ? batches : []);
    return redactRecentEventCommands(normalizedBatches, seat);
  },
});

export const getPublicEventsAsActor = internalQuery({
  args: {
    matchId: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
    actorUserId: v.id("users"),
    sinceVersion: v.optional(v.number()),
  },
  returns: v.array(vPublicEventLogEntry),
  handler: async (ctx, args) => {
    await requireSeatOwnership(ctx, args.matchId, args.seat, args.actorUserId);
    const batches = await match.getRecentEvents(ctx, {
      matchId: args.matchId,
      sinceVersion: typeof args.sinceVersion === "number" ? args.sinceVersion : 0,
    });
    const normalizedBatches = dedupeEventBatchesByVersion(Array.isArray(batches) ? batches : []);
    return buildPublicEventLog({
      batches: normalizedBatches,
      agentSeat: args.seat,
    });
  },
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

// ── Public Spectator Queries (no auth) ─────────────────────────────

const vSeat = v.union(v.literal("host"), v.literal("away"));

export const getSpectatorView = query({
  args: { matchId: v.string(), seat: vSeat },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { matchId, seat }) => {
    const rawView = await match.getPlayerView(ctx, { matchId, seat });
    if (!rawView) return null;
    let view: Record<string, unknown>;
    try { view = JSON.parse(rawView); } catch { return null; }

    const [meta, storyMatch, cardLookup] = await Promise.all([
      match.getMatchMeta(ctx, { matchId }),
      ctx.db.query("storyMatches").withIndex("by_matchId", (q: any) => q.eq("matchId", matchId)).first(),
      getCachedCardLookup(ctx),
    ]);

    return buildPublicSpectatorView({
      matchId,
      seat,
      status: (meta as any)?.status ?? null,
      mode: (meta as any)?.mode ?? null,
      chapterId: storyMatch?.chapterId ?? null,
      stageNumber: storyMatch?.stageNumber ?? null,
      view,
      cardLookup,
    });
  },
});

export const getSpectatorEventsPaginated = query({
  args: { matchId: v.string(), seat: vSeat, paginationOpts: paginationOptsValidator },
  returns: v.any(),
  handler: async (ctx, { matchId, seat, paginationOpts }) => {
    // Components don't support .paginate() so we fetch via getRecentEvents
    // and manually slice to simulate cursor-based pagination.
    const allEvents = await match.getRecentEvents(ctx, { matchId, sinceVersion: 0 });
    const batches = dedupeEventBatchesByVersion(Array.isArray(allEvents) ? allEvents : []);
    // Reverse to newest-first (getRecentEvents returns asc order)
    const desc = [...batches].reverse();
    const numItems = (paginationOpts as any)?.numItems ?? 20;
    const cursor = (paginationOpts as any)?.cursor;
    const startIdx = cursor ? parseInt(cursor, 10) : 0;
    const page = desc.slice(startIdx, startIdx + numItems);
    const endIdx = startIdx + page.length;
    const isDone = endIdx >= desc.length;
    return {
      page: buildPublicEventLog({ batches: page, agentSeat: seat }),
      isDone,
      continueCursor: isDone ? null : String(endIdx),
    };
  },
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
  },
  returns: vCompleteStoryStageResult,
  handler: async (ctx, args) => {
    const requester = await requireUser(ctx);

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
          gold: rewardGold + firstClearBonus,
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

      // Credit gold + xp to player economy
      const totalGold = rewardGold + firstClearBonus;
      const totalXp = rewardXp;
      await ctx.runMutation(internal.game.addRewards, {
        userId: progressOwnerId as any,
        gold: totalGold,
        xp: totalXp,
      });

      // Update playerStats win/streak counters
      const stats = await ctx.db
        .query("playerStats")
        .withIndex("by_userId", (q) => q.eq("userId", progressOwnerId))
        .unique();
      if (stats) {
        const newStreak = stats.currentStreak + 1;
        await ctx.db.patch(stats._id, {
          storyWins: stats.storyWins + 1,
          totalWins: stats.totalWins + 1,
          totalMatchesPlayed: stats.totalMatchesPlayed + 1,
          currentStreak: newStreak,
          bestStreak: Math.max(stats.bestStreak, newStreak),
          lastMatchAt: Date.now(),
        });
      }

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

      // Update playerStats loss counters and reset streak
      const lossStats = await ctx.db
        .query("playerStats")
        .withIndex("by_userId", (q) => q.eq("userId", progressOwnerId))
        .unique();
      if (lossStats) {
        await ctx.db.patch(lossStats._id, {
          totalLosses: lossStats.totalLosses + 1,
          totalMatchesPlayed: lossStats.totalMatchesPlayed + 1,
          currentStreak: 0,
          lastMatchAt: Date.now(),
        });
      }
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

export const completeStoryStageAsActor = internalMutation({
  args: {
    matchId: v.string(),
    actorUserId: v.id("users"),
  },
  returns: vCompleteStoryStageResult,
  handler: async (ctx, args) => {
    const requester = await ctx.db.get(args.actorUserId);
    if (!requester) {
      throw new ConvexError("User not found.");
    }

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

    if ((meta as any)?.status !== "ended") {
      throw new ConvexError("Match is not ended yet");
    }

    const winnerSeat = (meta as any)?.winner as "host" | "away" | null;
    const storyPlayerSeat = resolveSeatForUser(meta, storyMatch.userId) ?? "host";
    let won = false;

    if (winnerSeat) {
      won = winnerSeat === storyPlayerSeat;
    } else {
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
          gold: rewardGold + firstClearBonus,
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

      const totalGold = rewardGold + firstClearBonus;
      const totalXp = rewardXp;
      await ctx.runMutation(internal.game.addRewards, {
        userId: progressOwnerId as any,
        gold: totalGold,
        xp: totalXp,
      });

      const stats = await ctx.db
        .query("playerStats")
        .withIndex("by_userId", (q) => q.eq("userId", progressOwnerId))
        .unique();
      if (stats) {
        const newStreak = stats.currentStreak + 1;
        await ctx.db.patch(stats._id, {
          storyWins: stats.storyWins + 1,
          totalWins: stats.totalWins + 1,
          totalMatchesPlayed: stats.totalMatchesPlayed + 1,
          currentStreak: newStreak,
          bestStreak: Math.max(stats.bestStreak, newStreak),
          lastMatchAt: Date.now(),
        });
      }

      return {
        outcome,
        starsEarned,
        rewards: {
          gold: rewardGold,
          xp: rewardXp,
          firstClearBonus,
        },
      };
    }

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

    const lossStats = await ctx.db
      .query("playerStats")
      .withIndex("by_userId", (q) => q.eq("userId", progressOwnerId))
      .unique();
    if (lossStats) {
      await ctx.db.patch(lossStats._id, {
        totalLosses: lossStats.totalLosses + 1,
        totalMatchesPlayed: lossStats.totalMatchesPlayed + 1,
        currentStreak: 0,
        lastMatchAt: Date.now(),
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

// ── Match Presence & PvP Disconnect Timer ─────────────────────────

const PVP_DISCONNECT_TIMEOUT_MS = 60_000; // 60s without heartbeat → auto-surrender
const PVP_DISCONNECT_CHECK_INTERVAL_MS = 15_000; // re-check every 15s

export const upsertMatchPresence = mutation({
  args: {
    matchId: v.string(),
    platform: v.union(
      v.literal("web"),
      v.literal("telegram"),
      v.literal("discord"),
      v.literal("embedded"),
      v.literal("agent"),
      v.literal("cpu"),
      v.literal("unknown"),
    ),
    source: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("matchPresence")
      .withIndex("by_match_user", (q) =>
        q.eq("matchId", args.matchId).eq("userId", user._id),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeenAt: now,
        platform: args.platform,
        source: args.source,
      });
    } else {
      await ctx.db.insert("matchPresence", {
        matchId: args.matchId,
        userId: user._id,
        platform: args.platform,
        source: args.source,
        lastSeenAt: now,
        createdAt: now,
      });
    }

    return null;
  },
});

export const checkPvpDisconnect = internalMutation({
  args: { matchId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if (!meta || (meta as any).status !== "active") return null;
    if ((meta as any).mode !== "pvp") return null;
    if ((meta as any).isAIOpponent) return null;

    const now = Date.now();
    const hostId = (meta as any).hostId as string;
    const awayId = (meta as any).awayId as string;
    if (!awayId) return null;

    const presenceRows = await ctx.db
      .query("matchPresence")
      .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
      .collect();

    const hostPresence = presenceRows.find((r) => r.userId === hostId);
    const awayPresence = presenceRows.find((r) => r.userId === awayId);

    const hostStale = !hostPresence || now - hostPresence.lastSeenAt > PVP_DISCONNECT_TIMEOUT_MS;
    const awayStale = !awayPresence || now - awayPresence.lastSeenAt > PVP_DISCONNECT_TIMEOUT_MS;

    // If both are stale or neither is stale, keep checking
    if (hostStale === awayStale) {
      // Both disconnected or both connected — schedule next check if match still active
      if (!hostStale && !awayStale) {
        await ctx.scheduler.runAfter(
          PVP_DISCONNECT_CHECK_INTERVAL_MS,
          internal.game.checkPvpDisconnect,
          { matchId: args.matchId },
        );
      }
      return null;
    }

    // One player is stale → auto-surrender them
    const disconnectedSeat: "host" | "away" = hostStale ? "host" : "away";
    try {
      await match.submitAction(ctx, {
        matchId: args.matchId,
        command: JSON.stringify({ type: "SURRENDER" }),
        seat: disconnectedSeat,
      });
    } catch {
      // Match may have already ended
    }

    return null;
  },
});

// ── Player Stats / Economy ──────────────────────────────────────────

/**
 * Internal query: get stats for a given userId. Returns null if no row exists.
 */
export const getPlayerStatsById = internalQuery({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return ctx.db
      .query("playerStats")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Internal mutation: get-or-create pattern. Returns existing stats or inserts
 * a fresh row with defaults and returns it.
 */
export const getOrCreatePlayerStats = internalMutation({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("playerStats")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) return existing;

    const now = Date.now();
    const newId = await ctx.db.insert("playerStats", {
      userId: args.userId,
      ...DEFAULT_PLAYER_STATS,
      createdAt: now,
    });
    return ctx.db.get(newId);
  },
});

/**
 * Internal mutation: atomically add gold + xp to a player's stats and
 * recalculate their level. Creates the stats row if it doesn't exist yet.
 */
export const addRewards = internalMutation({
  args: {
    userId: v.id("users"),
    gold: v.number(),
    xp: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let stats = await ctx.db
      .query("playerStats")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (!stats) {
      const now = Date.now();
      const newId = await ctx.db.insert("playerStats", {
        userId: args.userId,
        ...DEFAULT_PLAYER_STATS,
        createdAt: now,
      });
      stats = (await ctx.db.get(newId))!;
    }

    const newGold = stats.gold + args.gold;
    const newXp = stats.xp + args.xp;
    const newLevel = calculateLevel(newXp);

    await ctx.db.patch(stats._id, {
      gold: newGold,
      xp: newXp,
      level: newLevel,
    });

    return null;
  },
});

/**
 * Internal mutation: process PvP match completion.
 * Awards rewards, updates playerStats for winner/loser, updates clique wins,
 * and marks the pvpLobby as ended.
 */
export const completePvpMatch = internalMutation({
  args: {
    matchId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // 1. Look up pvpLobby
    const lobby = await ctx.db
      .query("pvpLobbies")
      .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
      .first();
    if (!lobby || lobby.status === "ended") return null;

    // 2. Get match meta from component to find winner
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if (!meta || (meta as any)?.status !== "ended") return null;

    const winnerSeat = (meta as any)?.winner as "host" | "away" | null;
    if (!winnerSeat) return null;

    // 3. Resolve userIds from match meta
    const hostUserId = (meta as any)?.hostId;
    const awayUserId = (meta as any)?.awayId;
    if (!hostUserId || !awayUserId) return null;

    const winnerUserId = winnerSeat === "host" ? hostUserId : awayUserId;
    const loserUserId = winnerSeat === "host" ? awayUserId : hostUserId;

    // 3b. Update ELO ratings
    const ratingResult = await ctx.runMutation(
      (internal as any).ranked.updateRatings,
      { winnerId: winnerUserId, loserId: loserUserId },
    );

    // 3c. Record match history
    await ctx.db.insert("matchHistory", {
      matchId: args.matchId,
      mode: "pvp",
      winnerId: winnerUserId,
      loserId: loserUserId,
      winnerRatingBefore: ratingResult.winnerNewRating - ratingResult.winnerChange,
      loserRatingBefore: ratingResult.loserNewRating - ratingResult.loserChange,
      ratingChange: ratingResult.winnerChange,
      timestamp: Date.now(),
    });

    // 4. Award rewards
    // Winner base: 100 gold, 50 xp
    let winnerXp = 50;

    // 4a. Apply clique XP bonus (+10%) if winner's clique archetype matches deck archetype
    const winnerUserForBonus = await ctx.db.get(winnerUserId) as any;
    if (winnerUserForBonus?.cliqueId) {
      const winnerClique = await ctx.db.get(winnerUserForBonus.cliqueId) as any;
      if (winnerClique) {
        // Get the winner's active deck to check archetype match
        const winnerDeckId = winnerUserForBonus.activeDeckId;
        if (winnerDeckId) {
          try {
            const deckMeta = await cards.getDeck(ctx, { deckId: winnerDeckId });
            if (deckMeta?.archetype && winnerClique.archetype &&
                deckMeta.archetype === winnerClique.archetype) {
              winnerXp = Math.round(winnerXp * 1.1);
            }
          } catch {
            // Deck lookup failed — skip bonus
          }
        }
      }
    }

    await ctx.runMutation(internal.game.addRewards, {
      userId: winnerUserId,
      gold: 100,
      xp: winnerXp,
    });
    // Loser: 0 gold, 10 xp (consolation)
    await ctx.runMutation(internal.game.addRewards, {
      userId: loserUserId,
      gold: 0,
      xp: 10,
    });

    // 5. Update winner's playerStats
    const winnerStats = await ctx.db
      .query("playerStats")
      .withIndex("by_userId", (q) => q.eq("userId", winnerUserId))
      .unique();
    if (winnerStats) {
      const newStreak = winnerStats.currentStreak + 1;
      await ctx.db.patch(winnerStats._id, {
        pvpWins: winnerStats.pvpWins + 1,
        totalWins: winnerStats.totalWins + 1,
        totalMatchesPlayed: winnerStats.totalMatchesPlayed + 1,
        currentStreak: newStreak,
        bestStreak: Math.max(winnerStats.bestStreak, newStreak),
        lastMatchAt: Date.now(),
      });
    }

    // 6. Update loser's playerStats
    const loserStats = await ctx.db
      .query("playerStats")
      .withIndex("by_userId", (q) => q.eq("userId", loserUserId))
      .unique();
    if (loserStats) {
      await ctx.db.patch(loserStats._id, {
        pvpLosses: loserStats.pvpLosses + 1,
        totalLosses: loserStats.totalLosses + 1,
        totalMatchesPlayed: loserStats.totalMatchesPlayed + 1,
        currentStreak: 0,
        lastMatchAt: Date.now(),
      });
    }

    // 7. Update clique totalWins if winner has a clique
    // (reuse winnerUserForBonus fetched earlier in step 4a)
    if (winnerUserForBonus?.cliqueId) {
      const clique = await ctx.db.get(winnerUserForBonus.cliqueId) as any;
      if (clique) {
        await ctx.db.patch(clique._id, {
          totalWins: clique.totalWins + 1,
        });
      }
    }

    // 8. Mark lobby as ended
    await ctx.db.patch(lobby._id, {
      status: "ended",
      endedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Public query: return the authenticated user's match history
 * with opponent info and win/loss results.
 */
export const getMatchHistory = query({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = args.limit ?? 20;

    // Get matches where user was winner or loser
    const asWinner = await ctx.db
      .query("matchHistory")
      .withIndex("by_winnerId", (q) => q.eq("winnerId", user._id))
      .order("desc")
      .take(limit);
    const asLoser = await ctx.db
      .query("matchHistory")
      .withIndex("by_loserId", (q) => q.eq("loserId", user._id))
      .order("desc")
      .take(limit);

    // Merge, sort by timestamp, take top N
    const all = [
      ...asWinner.map((m) => ({ ...m, result: "win" as const })),
      ...asLoser.map((m) => ({ ...m, result: "loss" as const })),
    ]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    // Enrich with opponent username
    const enriched = [];
    for (const m of all) {
      const opponentId = m.result === "win" ? m.loserId : m.winnerId;
      const opponent = await ctx.db.get(opponentId);
      enriched.push({
        ...m,
        opponentUsername: (opponent as any)?.username ?? "Unknown",
      });
    }
    return enriched;
  },
});

/**
 * Public query: return the authenticated user's player stats.
 * Creates a default row if one doesn't exist yet.
 */
export const getPlayerStats = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const stats = await ctx.db
      .query("playerStats")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!stats) {
      // Return defaults without inserting (queries can't mutate).
      // The row will be created on first reward or via getOrCreatePlayerStats.
      return {
        userId: user._id,
        ...DEFAULT_PLAYER_STATS,
        createdAt: Date.now(),
      };
    }

    return stats;
  },
});

// ── Agent API helper queries ─────────────────────────────────────────

/**
 * Get the next story stage for a user (agent API).
 * Stub — story progression not yet implemented in engine.
 */
export const getNextStoryStageForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (_ctx, _args) => {
    return { chapterId: "chapter_1", stageNumber: 1 };
  },
});
