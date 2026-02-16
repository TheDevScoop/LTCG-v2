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
  handler: async (ctx, args) => cards.decks.getDeckWithCards(ctx, args.deckId),
});

// ── Deck Mutations ─────────────────────────────────────────────────

export const createDeck = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return cards.decks.createDeck(ctx, user._id, args.name);
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
    await cards.decks.setActiveDeck(ctx, user._id, args.deckId);
    await ctx.db.patch(user._id, { activeDeckId: args.deckId });
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

    // Check if user already picked a starter deck
    const existingDecks = await cards.decks.getUserDecks(ctx, user._id);
    if (existingDecks && existingDecks.length > 0) {
      throw new Error("You already have a deck. Starter selection is one-time.");
    }

    // Look up the recipe
    const recipe = DECK_RECIPES[args.deckCode];
    if (!recipe) {
      throw new Error(`Unknown deck code: ${args.deckCode}`);
    }

    // Build name → cardDef map
    const allCards = await cards.cards.getAllCards(ctx);
    const byName = new Map<string, any>();
    for (const c of allCards ?? []) {
      byName.set(c.name, c);
    }

    // Resolve recipe entries to card definition IDs
    const resolvedCards: { cardDefinitionId: string; quantity: number }[] = [];
    for (const entry of recipe) {
      const cardDef = byName.get(entry.cardName);
      if (!cardDef) {
        throw new Error(`Card not found in database: "${entry.cardName}"`);
      }
      resolvedCards.push({
        cardDefinitionId: cardDef._id,
        quantity: entry.copies,
      });
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
    const archetype = args.deckCode.replace("_starter", "");
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

// ── Start Story Battle ─────────────────────────────────────────────

export const startStoryBattle = mutation({
  args: {
    chapterId: v.string(),
    stageNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const stageNum = args.stageNumber ?? 1;

    // Resolve the stage to get its _id for progress tracking
    const stages = await story.stages.getStages(ctx, args.chapterId);
    const stage = (stages as any[])?.find(
      (s: any) => s.stageNumber === stageNum,
    );
    if (!stage) throw new Error(`Stage ${stageNum} not found in chapter`);

    if (!user.activeDeckId) throw new Error("No active deck set");
    const deckData = await cards.decks.getDeckWithCards(ctx, user.activeDeckId);
    if (!deckData) throw new Error("Deck not found");

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

function buildAIDeck(allCards: any[]): string[] {
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
    // this was a host action that didn't end the game.
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if ((meta as any)?.status === "active" && (meta as any)?.isAIOpponent) {
      const events = JSON.parse(result.events);
      const gameOver = events.some((e: any) => e.type === "GAME_OVER");
      if (!gameOver && args.seat === "host") {
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
    const monstersInHand = view.hand
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
      if (level < 7 && view.board.length < 5) {
        return {
          type: "SUMMON",
          cardId: strongest.id,
          position: "attack",
        };
      }

      // Level 7+: tribute weakest face-up monster if available
      if (level >= 7 && view.board.length > 0) {
        const faceUpMonsters = view.board.filter((c: any) => !c.faceDown);
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

    // 2. Set spells/traps if backrow has space
    const spellsTrapsInHand = view.hand
      .map((id: string) => ({ id, def: cardLookup[id] }))
      .filter(
        (c: any) => c.def?.cardType === "spell" || c.def?.cardType === "trap"
      );

    if (spellsTrapsInHand.length > 0 && view.spellTrapZone.length < 5) {
      return {
        type: "SET_SPELL_TRAP",
        cardId: spellsTrapsInHand[0].id,
      };
    }

    // 3. If main phase 1 with monsters on board: advance to combat
    if (phase === "main") {
      const attackableMonsters = view.board.filter(
        (c: any) => !c.faceDown && c.canAttack && !c.hasAttackedThisTurn
      );
      if (attackableMonsters.length > 0) {
        return { type: "ADVANCE_PHASE" };
      }
    }

    // 4. If main2: end turn
    if (phase === "main2") {
      return { type: "END_TURN" };
    }

    // Default for main phase: end turn
    return { type: "END_TURN" };
  }

  // Combat phase
  if (phase === "combat") {
    // Find all monsters that can attack
    const attackableMonsters = view.board.filter(
      (c: any) => !c.faceDown && c.canAttack && !c.hasAttackedThisTurn
    );

    if (attackableMonsters.length > 0) {
      const attacker = attackableMonsters[0];
      const attackerAtk =
        (cardLookup[attacker.definitionId]?.attack ?? 0) +
        (attacker.temporaryBoosts?.attack ?? 0);

      // Check opponent's face-up monsters
      const opponentFaceUpMonsters = view.opponentBoard.filter(
        (c: any) => !c.faceDown
      );

      if (opponentFaceUpMonsters.length === 0) {
        // Direct attack
        return {
          type: "DECLARE_ATTACK",
          attackerId: attacker.cardId,
        };
      }

      // Find weakest opponent monster
      let weakestOpponent = opponentFaceUpMonsters[0];
      let weakestAtk =
        (cardLookup[weakestOpponent.definitionId]?.attack ?? 0) +
        (weakestOpponent.temporaryBoosts?.attack ?? 0);

      for (const opp of opponentFaceUpMonsters) {
        const oppAtk =
          (cardLookup[opp.definitionId]?.attack ?? 0) +
          (opp.temporaryBoosts?.attack ?? 0);
        if (oppAtk < weakestAtk) {
          weakestOpponent = opp;
          weakestAtk = oppAtk;
        }
      }

      // Attack if we're stronger
      if (attackerAtk > weakestAtk) {
        return {
          type: "DECLARE_ATTACK",
          attackerId: attacker.cardId,
          targetId: weakestOpponent.cardId,
        };
      }
    }

    // No attacks possible or safe, advance phase
    return { type: "ADVANCE_PHASE" };
  }

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
    if ((meta as any)?.status !== "active") return;

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
        seat: "away",
      });
      if (!viewJson) return;

      const view = JSON.parse(viewJson);

      // Stop if game is over or no longer AI's turn
      if (view.gameOver || view.currentTurnPlayer !== "away") return;

      // Pick AI command
      const command = pickAICommand(view, cardLookup);

      try {
        await match.submitAction(ctx, {
          matchId: args.matchId,
          command: JSON.stringify(command),
          seat: "away",
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
    const stages = await story.stages.getStages(ctx, doc.chapterId);
    const stage = (stages as any[])?.find(
      (s: any) => s.stageNumber === doc.stageNumber,
    );

    return {
      matchId: doc.matchId,
      chapterId: doc.chapterId,
      stageNumber: doc.stageNumber,
      stageId: doc.stageId,
      outcome: doc.outcome ?? null,
      starsEarned: doc.starsEarned ?? null,
      rewardsGold: stage?.rewardGold ?? 0,
      rewardsXp: stage?.rewardXp ?? 0,
      firstClearBonus: stage?.firstClearBonus ?? 0,
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
  args: { matchId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Look up story context
    const storyMatch = await ctx.db
      .query("storyMatches")
      .withIndex("by_matchId", (q: any) => q.eq("matchId", args.matchId))
      .first();
    if (!storyMatch) throw new Error("Not a story match");
    if (storyMatch.userId !== user._id) throw new Error("Not your match");

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
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if ((meta as any)?.status !== "ended") {
      throw new Error("Match is not ended yet");
    }

    const won = (meta as any)?.winner === "host";
    const outcome = won ? "won" : "lost";

    // Get final LP for star calculation
    const viewJson = await match.getPlayerView(ctx, {
      matchId: args.matchId,
      seat: "host",
    });
    let finalLP = 0;
    const maxLP = 8000;
    if (viewJson) {
      const view = JSON.parse(viewJson);
      finalLP = view?.players?.host?.lifePoints ?? 0;
    }

    const starsEarned = calculateStars(won, finalLP, maxLP);

    // Look up stage for rewards
    const stages = await story.stages.getStages(ctx, storyMatch.chapterId);
    const stage = (stages as any[])?.find(
      (s: any) => s.stageNumber === storyMatch.stageNumber,
    );

    const rewardGold = won ? (stage?.rewardGold ?? 0) : 0;
    const rewardXp = won ? (stage?.rewardXp ?? 0) : 0;

    // Check if this is first clear for bonus
    const existingProgress = await story.progress.getStageProgress(
      ctx,
      user._id,
      storyMatch.stageId,
    );
    const isFirstClear =
      won && !(existingProgress as any[])?.some(
        (p: any) => p.stageId === storyMatch.stageId && p.timesCompleted > 0,
      );
    const firstClearBonus = isFirstClear ? (stage?.firstClearBonus ?? 0) : 0;

    // Record stage progress in story component
    if (won) {
      await story.progress.upsertStageProgress(ctx, {
        userId: user._id,
        stageId: storyMatch.stageId,
        chapterId: storyMatch.chapterId,
        stageNumber: storyMatch.stageNumber,
        status: starsEarned >= 3 ? "starred" : "completed",
        starsEarned,
        timesCompleted: 1,
        firstClearClaimed: isFirstClear,
        lastCompletedAt: Date.now(),
      });
    }

    // Update host-layer record with results
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
  },
});
