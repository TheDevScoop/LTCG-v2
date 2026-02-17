import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./auth";
import { LTCGCards } from "@lunchtable-tcg/cards";
import { LTCGMatch } from "@lunchtable-tcg/match";
import { LTCGStory } from "@lunchtable-tcg/story";
import { createInitialState, DEFAULT_CONFIG, buildCardLookup } from "@lunchtable-tcg/engine";
import type { Command } from "@lunchtable-tcg/engine";
import { DECK_RECIPES, STARTER_DECKS } from "./cardData";

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

const normalizeDeckRecordId = (deckRecord?: { deckId?: string } | null) =>
  normalizeDeckId(deckRecord?.deckId);

const resolveDefaultStarterDeckCode = () => {
  const configured = STARTER_DECKS.find((deck) => DECK_RECIPES[deck.deckCode]);
  if (configured?.deckCode) return configured.deckCode;
  const keys = Object.keys(DECK_RECIPES);
  return keys[0] ?? null;
};

const createStarterDeckFromRecipe = async (ctx: any, userId: string) => {
  const deckCode = resolveDefaultStarterDeckCode();
  if (!deckCode) return null;

  const recipe = DECK_RECIPES[deckCode];
  if (!recipe) return null;

  const allCards = await cards.cards.getAllCards(ctx);
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

  const firstDeckId = activeDecks?.map(normalizeDeckRecordId).find((id) => Boolean(id)) ?? null;

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
  if (!deckId) throw new Error("No active deck set");

  const deckData = await cards.decks.getDeckWithCards(ctx, deckId);
  if (!deckData) {
    await cards.decks.setActiveDeck(ctx, user._id, deckId);
    const fallbackDeckId = await resolveActiveDeckIdForUser(ctx, {
      ...user,
      activeDeckId: undefined,
    });
    if (!fallbackDeckId) {
      throw new Error("Active deck not found");
    }
    const fallbackDeckData = await cards.decks.getDeckWithCards(ctx, fallbackDeckId);
    if (!fallbackDeckData) {
      throw new Error("Deck not found");
    }
    return { deckId: fallbackDeckId, deckData: fallbackDeckData };
  }

  return { deckId, deckData };
}

// ── Card Queries ───────────────────────────────────────────────────

export const getAllCards = query({
  args: {},
  handler: async (ctx) => cards.cards.getAllCards(ctx),
});

export const getStarterDecks = query({
  args: {},
  handler: async () => STARTER_DECKS,
});

export const getUserCards = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return cards.cards.getUserCards(ctx, user._id);
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
    const deckId = normalizeDeckId(args.deckId);
    if (!deckId) return null;
    return cards.decks.getDeckWithCards(ctx, deckId);
  },
});

// ── Deck Mutations ─────────────────────────────────────────────────

export const createDeck = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const activeDeckId = await resolveActiveDeckIdForUser(ctx, user);
    if (!activeDeckId) {
      throw new Error("Select a starter deck before creating a custom deck.");
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
  handler: async (ctx, args) => cards.decks.saveDeck(ctx, args.deckId, args.cards),
});

export const setActiveDeck = mutation({
  args: { deckId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const deckId = normalizeDeckId(args.deckId);
    if (!deckId) {
      throw new Error("Invalid deck id");
    }
    await cards.decks.setActiveDeck(ctx, user._id, deckId);
    await ctx.db.patch(user._id, { activeDeckId: deckId });
  },
});

// ── Starter Deck Selection ─────────────────────────────────────────
//
// Uses DECK_RECIPES to grant exactly the right cards + build the deck.
// Bypasses the component's selectStarterDeck which expects pre-filtered
// card arrays that don't match our data model.

export const selectStarterDeck = mutation({
  args: { deckCode: v.string() },
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
      throw new Error(`Unknown deck code: ${args.deckCode}`);
    }

    const allCards = await cards.cards.getAllCards(ctx);
    const resolvedCards = resolveDeckCards(allCards ?? [], recipe);
    if (resolvedCards.length === 0) {
      throw new Error("No cards available to build starter deck.");
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

// ── Story Queries ──────────────────────────────────────────────────

export const getChapters = query({
  args: {},
  handler: async (ctx) => story.chapters.getChapters(ctx, { status: "published" }),
});

export const getChapterStages = query({
  args: { chapterId: v.string() },
  handler: async (ctx, args) => story.stages.getStages(ctx, args.chapterId),
});

export const getStoryProgress = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return story.progress.getProgress(ctx, user._id);
  },
});

export const getStageProgress = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return story.progress.getStageProgress(ctx, user._id);
  },
});

export const getStageWithNarrative = query({
  args: { chapterId: v.string(), stageNumber: v.number() },
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
  const chapter = await story.chapters.getChapter(ctx, { chapterId: chapterId as any });
  if (!chapter) {
    throw new Error("Chapter not found");
  }

  const stages = await story.stages.getStages(ctx, chapterId);
  const stage = findStageByNumber(stages, stageNumber);
  if (!stage) {
    throw new Error(`Stage ${stageNumber} not found in chapter`);
  }

  const allChapters = await story.chapters.getChapters(ctx, { status: "published" });
  const sortedChapters = [...(allChapters ?? [])].sort(compareStoryChaptersByOrder);
  const chapterIndex = sortedChapters.findIndex((item: any) => item?._id === chapterId);
  if (chapterIndex === -1) {
    throw new Error("Chapter is not available");
  }

  const unlockRequirements = chapter.unlockRequirements ?? {};
  if (typeof unlockRequirements.minimumLevel === "number") {
    const progress = await story.progress.getProgress(ctx, userId);
    const playerLevel = resolveStoryLevelFromProgress(progress ?? []);
    if (playerLevel < unlockRequirements.minimumLevel) {
      throw new Error(
        `Minimum level ${unlockRequirements.minimumLevel} is required to access this chapter.`,
      );
    }
  }

  if (unlockRequirements.previousChapter || unlockRequirements.requiredChapterId) {
    let requiredChapterId =
      unlockRequirements.requiredChapterId?.trim?.() ??
      (unlockRequirements.previousChapter && chapterIndex > 0 ? sortedChapters[chapterIndex - 1]?._id : "");

    if (requiredChapterId) {
      const requiredChapter = await story.chapters.getChapter(ctx, {
        chapterId: requiredChapterId,
      });
      if (!requiredChapter) {
        throw new Error("Required chapter not found");
      }

      const requiredChapterProgress = await story.progress.getChapterProgress(ctx, {
        userId,
        actNumber: requiredChapter.actNumber ?? 0,
        chapterNumber: requiredChapter.chapterNumber ?? 0,
      });
      if (!isChapterProgressCompleted(requiredChapterProgress)) {
        throw new Error("Previous chapter must be completed first");
      }
    }
  }

  if (stageNumber > 1) {
    const previousStage = findStageByNumber(stages, stageNumber - 1);
    if (!previousStage) {
      throw new Error(`Previous stage ${stageNumber - 1} not found in chapter`);
    }

    const previousProgress = await story.progress.getStageProgress(
      ctx,
      userId,
      previousStage._id,
    );
    if (!isStageProgressCompleted(previousProgress)) {
      throw new Error(`Stage ${stageNumber - 1} must be cleared first`);
    }
  }

  const existingProgress = await story.progress.getChapterProgress(ctx, {
    userId,
    actNumber: chapter.actNumber ?? 0,
    chapterNumber: chapter.chapterNumber ?? 0,
  });

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
  const existingProgress = await story.progress.getChapterProgress(ctx, {
    userId,
    actNumber: chapter.actNumber ?? 0,
    chapterNumber: chapter.chapterNumber ?? 0,
  });

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
      throw new Error("You already have an open waiting match. Finish or cancel it first.");
    }

    const { deckData } = await resolveActiveDeckForStory(ctx, user);
    const playerDeck = getDeckCardIdsFromDeckData(deckData);
    if (playerDeck.length < 30) throw new Error("Deck must have at least 30 cards");

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
      throw new Error("Match not found.");
    }

    if (meta.hostId !== user._id) {
      throw new Error("You are not the host of this match.");
    }

    if ((meta as any).status !== "waiting") {
      throw new Error(`Match is not cancellable (status: ${(meta as any).status}).`);
    }

    if ((meta as any).awayId !== null) {
      throw new Error("Cannot cancel match after an away player has joined.");
    }

    await ctx.db.patch(meta._id, {
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

    return { matchId: args.matchId, canceled: true, status: "ended", outcome: "abandoned" };
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

// ── Submit Action ──────────────────────────────────────────────────

export const submitAction = mutation({
  args: {
    matchId: v.string(),
    command: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
  },
  handler: async (ctx, args) => {
    const result = await match.submitAction(ctx, {
      matchId: args.matchId,
      command: args.command,
      seat: args.seat,
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
      const events = JSON.parse(result.events);
      const gameOver = events.some((e: any) => e.type === "GAME_OVER");
      if (!gameOver) {
        await ctx.scheduler.runAfter(500, internal.game.executeAITurn, {
          matchId: args.matchId,
        });
      }
    }

    return result;
  },
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

    if (monstersInHand.length > 0) {
      // Sort by attack (descending)
      monstersInHand.sort(
        (a: any, b: any) => (b.def?.attack ?? 0) - (a.def?.attack ?? 0)
      );

      const strongest = monstersInHand[0];
      const level = strongest.def?.level ?? 0;

      // Level < 7: no tribute needed
      if (level < 7 && board.length < 5) {
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

    if (spellsTrapsInHand.length > 0 && spellTrapZone.length < 5) {
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

  // Default: END_TURN
  return { type: "END_TURN" };
}

// ── AI Turn ────────────────────────────────────────────────────────

export const executeAITurn = internalMutation({
  args: { matchId: v.string() },
  handler: async (ctx, args) => {
    // Guard: check it's still AI's turn before acting.
    // This prevents duplicate AI turns if the scheduler fires twice
    // (e.g., from rapid player actions or network retries).
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    const aiSeat = resolveAICupSeat(meta);
    if ((meta as any)?.status !== "active" || !aiSeat) return;

    // Get all cards for card lookup
    const allCards = await cards.cards.getAllCards(ctx);
    const cardLookup: Record<string, any> = {};
    for (const card of allCards ?? []) {
      cardLookup[card._id] = card;
    }

  // Loop up to 20 actions
  for (let i = 0; i < 20; i++) {
      const viewJson = await match.getPlayerView(ctx, {
        matchId: args.matchId,
        seat: aiSeat,
      });
      if (!viewJson) return;

      const view = JSON.parse(viewJson);

      // Stop if game is over or no longer AI's turn
      if (view.gameOver || view.currentTurnPlayer !== aiSeat) return;

      if (Array.isArray(view.currentChain) && view.currentChain.length > 0) {
        try {
          await match.submitAction(ctx, {
            matchId: args.matchId,
            command: JSON.stringify({ type: "CHAIN_RESPONSE", pass: true }),
            seat: aiSeat,
          });
        } catch {
          return;
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
        return;
      }

      // If command was END_TURN, stop
      if (command.type === "END_TURN") return;
    }
  },
});

// ── Game View Queries ──────────────────────────────────────────────

export const getPlayerView = query({
  args: {
    matchId: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
  },
  handler: async (ctx, args) => match.getPlayerView(ctx, args),
});

export const getOpenPrompt = query({
  args: {
    matchId: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
  },
  handler: async (ctx, args) => match.getOpenPrompt(ctx, args),
});

export const getMatchMeta = query({
  args: { matchId: v.string() },
  handler: async (ctx, args) => match.getMatchMeta(ctx, args),
});

export const getRecentEvents = query({
  args: { matchId: v.string(), sinceVersion: v.number() },
  handler: async (ctx, args) => match.getRecentEvents(ctx, args),
});

export const getActiveMatchByHost = query({
  args: { hostId: v.string() },
  handler: async (ctx, args) => match.getActiveMatchByHost(ctx, args),
});

// ── Story Match Context ─────────────────────────────────────────────

export const getStoryMatchContext = query({
  args: { matchId: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("storyMatches")
      .withIndex("by_matchId", (q: any) => q.eq("matchId", args.matchId))
      .first();
    if (!doc) return null;

    // Load the stage data for dialogue and reward info
    let stage = doc.stageId
      ? await story.stages.getStage(ctx, { stageId: doc.stageId as any })
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
    actorUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const requester = args.actorUserId
      ? await ctx.db.get(args.actorUserId)
      : await requireUser(ctx);

    if (!requester) {
      throw new Error("User not found.");
    }

    // Look up story context
    const storyMatch = await ctx.db
      .query("storyMatches")
      .withIndex("by_matchId", (q: any) => q.eq("matchId", args.matchId))
      .first();
    if (!storyMatch) throw new Error("Not a story match");

    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if (!meta) throw new Error("Match metadata not found");
    const requesterSeat = resolveSeatForUser(meta, requester._id);
    if (storyMatch.userId !== requester._id && !requesterSeat) {
      throw new Error("Not your match");
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
      throw new Error("Match is not ended yet");
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
    const outcome = won ? "won" : "lost";

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
      throw new Error("Stage not found");
    }

    const rewardGold = won ? (stage.rewardGold ?? 0) : 0;
    const rewardXp = won ? (stage.rewardXp ?? 0) : 0;

    const chapter = await story.chapters.getChapter(ctx, {
      chapterId: storyMatch.chapterId as any,
    });
    if (!chapter) {
      throw new Error("Chapter not found");
    }

    const chapterProgress = await story.progress.getChapterProgress(ctx, {
      userId: progressOwnerId,
      actNumber: chapter.actNumber ?? 0,
      chapterNumber: chapter.chapterNumber ?? 0,
    });
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
      throw new Error("Unable to create chapter progress");
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
