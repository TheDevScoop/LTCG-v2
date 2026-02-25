# LTCG v2 Fresh Start — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fresh Convex deployment with ~5 backend files wiring 3 component packages. Cards + Story mode working end-to-end.

**Architecture:** Host `convex/` is a thin orchestration layer. Card definitions, decks, match state, and story progress all live in white-label component tables. The `@lunchtable/engine` runs pure game logic. The `@lunchtable/match` component persists event-sourced snapshots.

**Tech Stack:** Convex (backend), TanStack Start (frontend), Privy (auth), @lunchtable/* component packages.

---

### Task 1: Create fresh Convex project

**Files:**
- Create: `convex/convex.config.ts`
- Create: `convex/schema.ts`

**Step 1: Back up old convex directory**

```bash
mv convex convex-v1-backup
```

**Step 2: Create `convex/convex.config.ts`**

```typescript
import ltcgCards from "@lunchtable/cards/convex.config";
import ltcgMatch from "@lunchtable/match/convex.config";
import ltcgStory from "@lunchtable/story/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(ltcgCards);
app.use(ltcgMatch);
app.use(ltcgStory);

export default app;
```

**Step 3: Create `convex/schema.ts`**

Minimal — just the users table for Privy auth:

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    privyId: v.string(),
    username: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    activeDeckId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_privyId", ["privyId"])
    .index("by_username", ["username"]),
});
```

**Step 4: Run convex dev to generate types and provision deployment**

```bash
bunx convex dev --once --typecheck=disable
```

Expected: New deployment provisioned, `convex/_generated/` created with api.d.ts referencing the 3 components.

**Step 5: Commit**

```bash
git add convex/ convex-v1-backup/
git commit -m "feat: fresh convex deployment with cards + match + story components"
```

---

### Task 2: Create auth module

**Files:**
- Create: `convex/auth.ts`

**Step 1: Create `convex/auth.ts`**

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { QueryCtx, MutationCtx } from "./_generated/server";

// Called by frontend on Privy login to sync user
export const syncUser = mutation({
  args: {
    privyId: v.string(),
    email: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_privyId", (q) => q.eq("privyId", args.privyId))
      .first();

    if (existing) {
      if (args.email || args.username) {
        await ctx.db.patch(existing._id, {
          ...(args.email && { email: args.email }),
          ...(args.username && { username: args.username }),
        });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      privyId: args.privyId,
      username: args.username ?? `player_${Date.now()}`,
      email: args.email,
      createdAt: Date.now(),
    });
  },
});

export const currentUser = query({
  args: { privyId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_privyId", (q) => q.eq("privyId", args.privyId))
      .first();
  },
});

// Helper: get authenticated user from privyId (used by other mutations)
export async function getUser(ctx: QueryCtx | MutationCtx, privyId: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_privyId", (q) => q.eq("privyId", privyId))
    .first();
  if (!user) throw new Error("User not found");
  return user;
}
```

**Step 2: Deploy**

```bash
bunx convex dev --once --typecheck=disable
```

**Step 3: Commit**

```bash
git add convex/auth.ts
git commit -m "feat: auth module — syncUser, currentUser, getUser helper"
```

---

### Task 3: Create game module — story battles via match component

**Files:**
- Create: `convex/game.ts`

This is the core orchestration file. It wires the component clients together.

**Step 1: Create `convex/game.ts`**

```typescript
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getUser } from "./auth";
import { LTCGCards } from "@lunchtable/cards";
import { LTCGMatch } from "@lunchtable/match";
import { LTCGStory } from "@lunchtable/story";
import { createInitialState, legalMoves } from "@lunchtable/engine";
import type { Command, GameState, Seat } from "@lunchtable/engine";

const cards = new LTCGCards(components.lunchtable_tcg_cards as any);
const match = new LTCGMatch(components.lunchtable_tcg_match as any);
const story = new LTCGStory(components.lunchtable_tcg_story as any);

// ── Card Queries (passthrough to component) ────────────────────────

export const getAllCards = query({
  args: {},
  handler: async (ctx) => cards.cards.getAllCards(ctx),
});

export const getUserCards = query({
  args: { privyId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.privyId);
    return cards.cards.getUserCards(ctx, user._id);
  },
});

export const getUserDecks = query({
  args: { privyId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.privyId);
    return cards.decks.getUserDecks(ctx, user._id);
  },
});

export const getDeckWithCards = query({
  args: { deckId: v.string() },
  handler: async (ctx, args) => cards.decks.getDeckWithCards(ctx, args.deckId),
});

// ── Deck Mutations ─────────────────────────────────────────────────

export const createDeck = mutation({
  args: { privyId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.privyId);
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
  args: { privyId: v.string(), deckId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.privyId);
    await cards.decks.setActiveDeck(ctx, user._id, args.deckId);
    await ctx.db.patch(user._id, { activeDeckId: args.deckId });
  },
});

export const selectStarterDeck = mutation({
  args: { privyId: v.string(), deckCode: v.string() },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.privyId);
    // Get starter deck definition
    const allCards = await cards.cards.getAllCards(ctx);
    await cards.decks.selectStarterDeck(ctx, user._id, args.deckCode, allCards);
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
  args: { privyId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.privyId);
    return story.progress.getProgress(ctx, user._id);
  },
});

export const getStageProgress = query({
  args: { privyId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.privyId);
    return story.progress.getStageProgress(ctx, user._id);
  },
});

// ── Start Story Battle ─────────────────────────────────────────────

export const startStoryBattle = mutation({
  args: {
    privyId: v.string(),
    chapterId: v.string(),
    stageNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.privyId);

    // Load player's active deck
    if (!user.activeDeckId) throw new Error("No active deck set");
    const deckData = await cards.decks.getDeckWithCards(ctx, user.activeDeckId);
    if (!deckData) throw new Error("Deck not found");

    // Build player's deck as card ID array
    const playerDeck: string[] = [];
    for (const card of (deckData as any).cards ?? []) {
      for (let i = 0; i < (card.quantity ?? 1); i++) {
        playerDeck.push(card.cardDefinitionId);
      }
    }
    if (playerDeck.length < 30) throw new Error("Deck must have at least 30 cards");

    // Load stage info for AI difficulty
    const stages = await story.stages.getStages(ctx, args.chapterId);
    const stageNum = args.stageNumber ?? 1;
    const stage = (stages ?? []).find((s: any) => s.stageNumber === stageNum);
    const aiDifficulty = (stage as any)?.aiDifficulty ?? "easy";

    // Build AI deck from all available cards
    const allCards = await cards.cards.getAllCards(ctx);
    const aiDeck = buildAIDeck(allCards);

    // Build cardLookup for engine
    const cardLookup: Record<string, any> = {};
    for (const c of allCards ?? []) {
      cardLookup[c._id] = c;
    }

    // Create initial game state via engine
    const initialState = createInitialState(
      cardLookup,
      {}, // default config
      user._id,
      "cpu",
      playerDeck,
      aiDeck,
      "host", // player goes first
    );

    // Create match via component
    const matchId = await match.createMatch(ctx, {
      hostId: user._id,
      awayId: "cpu",
      mode: "story",
      hostDeck: playerDeck,
      awayDeck: aiDeck,
      isAIOpponent: true,
    });

    // Start match with initial state
    await match.startMatch(ctx, {
      matchId,
      initialState: JSON.stringify(initialState),
    });

    return { matchId, stageNumber: stageNum };
  },
});

function buildAIDeck(allCards: any[]): string[] {
  const deck: string[] = [];
  const stereotypes = allCards.filter((c: any) => c.cardType === "stereotype" && c.isActive);
  const spells = allCards.filter((c: any) => c.cardType === "spell" && c.isActive);
  const traps = allCards.filter((c: any) => c.cardType === "trap" && c.isActive);

  // ~20 stereotypes, ~12 spells, ~8 traps (up to 3 copies each)
  for (const card of stereotypes.slice(0, 7)) {
    for (let i = 0; i < 3; i++) deck.push(card._id);
  }
  for (const card of spells.slice(0, 6)) {
    for (let i = 0; i < 2; i++) deck.push(card._id);
  }
  for (const card of traps.slice(0, 4)) {
    for (let i = 0; i < 2; i++) deck.push(card._id);
  }

  // Pad to 40 if needed
  while (deck.length < 40 && allCards.length > 0) {
    deck.push(allCards[deck.length % allCards.length]._id);
  }

  return deck.slice(0, 40);
}

// ── Submit Action (player or AI turn) ──────────────────────────────

export const submitAction = mutation({
  args: {
    matchId: v.string(),
    command: v.string(), // JSON-serialized Command
    seat: v.union(v.literal("host"), v.literal("away")),
  },
  handler: async (ctx, args) => {
    const result = await match.submitAction(ctx, {
      matchId: args.matchId,
      command: args.command,
      seat: args.seat,
    });

    // If it's now the AI's turn and game isn't over, schedule AI
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if ((meta as any)?.status === "active" && (meta as any)?.isAIOpponent) {
      // Parse events to check if game is over
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

// ── AI Turn (internal, scheduled) ──────────────────────────────────

export const executeAITurn = internalMutation({
  args: { matchId: v.string() },
  handler: async (ctx, args) => {
    // Load current state from latest snapshot
    const viewJson = await match.getPlayerView(ctx, {
      matchId: args.matchId,
      seat: "away",
    });
    if (!viewJson) return;

    // We need the full state for legalMoves, load from snapshot directly
    // For now, use a simple approach: advance phase / end turn
    // NOTE: Use legalMoves with full state for smarter AI
    const command: Command = { type: "END_TURN" };

    try {
      const result = await match.submitAction(ctx, {
        matchId: args.matchId,
        command: JSON.stringify(command),
        seat: "away",
      });

      // Check if game ended
      const events = JSON.parse(result.events);
      const gameOver = events.some((e: any) => e.type === "GAME_OVER");
      if (gameOver) return;

      // If still AI's turn (e.g. multiple phases), schedule next action
      // For MVP, AI just ends turn immediately
    } catch {
      // Game may have ended or errored — just stop
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
```

**Step 2: Deploy**

```bash
bunx convex dev --once --typecheck=disable
```

**Step 3: Commit**

```bash
git add convex/game.ts
git commit -m "feat: game module — story battles, AI turns, card/deck/story queries"
```

---

### Task 4: Create seed module

**Files:**
- Create: `convex/seed.ts`

**Step 1: Create `convex/seed.ts`**

Seeds card definitions and story chapters/stages. Run once after deployment.

```typescript
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { LTCGCards } from "@lunchtable/cards";
import { LTCGStory } from "@lunchtable/story";

const cards = new LTCGCards(components.lunchtable_tcg_cards as any);
const story = new LTCGStory(components.lunchtable_tcg_story as any);

export const seedAll = internalMutation({
  handler: async (ctx) => {
    // ── Seed Cards ──────────────────────────────────────────────
    const cardCount = await cards.seeds.seedCardDefinitions(ctx, CARD_DEFINITIONS);

    // ── Seed Starter Decks ──────────────────────────────────────
    await cards.seeds.seedStarterDecks(ctx, STARTER_DECKS);

    // ── Seed Story Chapters ─────────────────────────────────────
    const chaptersCount = await story.seeds.seedChapters(ctx, CHAPTERS);

    // Get chapter IDs for stages
    const chapters = await story.chapters.getChapters(ctx, { status: "published" });
    const ch1 = chapters?.find((c: any) => c.chapterNumber === 1);

    let stagesCount = 0;
    if (ch1) {
      stagesCount = await story.seeds.seedStages(ctx, CHAPTER_1_STAGES(ch1._id));
    }

    return { cardCount, chaptersCount, stagesCount };
  },
});

// ── Card Definitions ──────────────────────────────────────────────
// Minimal set: 6 stereotypes, 4 spells, 3 traps = 13 unique cards
const CARD_DEFINITIONS = [
  // Stereotypes (monsters)
  { name: "Cafeteria Kid", rarity: "common", archetype: "mixed", cardType: "stereotype", attack: 1200, defense: 800, cost: 3, level: 3, isActive: true, createdAt: Date.now() },
  { name: "Hall Monitor", rarity: "common", archetype: "geek", cardType: "stereotype", attack: 1400, defense: 1000, cost: 4, level: 4, isActive: true, createdAt: Date.now() },
  { name: "Class Clown", rarity: "common", archetype: "dropout", cardType: "stereotype", attack: 1000, defense: 600, cost: 2, level: 2, isActive: true, createdAt: Date.now() },
  { name: "Teacher's Pet", rarity: "rare", archetype: "geek", cardType: "stereotype", attack: 1600, defense: 1200, cost: 5, level: 5, isActive: true, createdAt: Date.now() },
  { name: "Skater Punk", rarity: "common", archetype: "dropout", cardType: "stereotype", attack: 1300, defense: 700, cost: 3, level: 3, isActive: true, createdAt: Date.now() },
  { name: "Library Ghost", rarity: "rare", archetype: "geek", cardType: "stereotype", attack: 1800, defense: 1500, cost: 6, level: 6, isActive: true, createdAt: Date.now() },
  { name: "Lunch Lady", rarity: "uncommon", archetype: "mixed", cardType: "stereotype", attack: 1500, defense: 1800, cost: 5, level: 5, isActive: true, createdAt: Date.now() },
  { name: "Detention King", rarity: "rare", archetype: "dropout", cardType: "stereotype", attack: 2000, defense: 1000, cost: 6, level: 6, isActive: true, createdAt: Date.now() },

  // Spells
  { name: "Pop Quiz", rarity: "common", archetype: "mixed", cardType: "spell", cost: 1, spellType: "normal", isActive: true, ability: "Draw 1 card", createdAt: Date.now() },
  { name: "Homework Shield", rarity: "common", archetype: "geek", cardType: "spell", cost: 2, spellType: "equip", isActive: true, ability: "Target stereotype gains +500 DEF", createdAt: Date.now() },
  { name: "Recess Bell", rarity: "uncommon", archetype: "mixed", cardType: "spell", cost: 2, spellType: "normal", isActive: true, ability: "All your stereotypes gain +300 ATK this turn", createdAt: Date.now() },
  { name: "Cheat Sheet", rarity: "rare", archetype: "dropout", cardType: "spell", cost: 3, spellType: "normal", isActive: true, ability: "Draw 2 cards", createdAt: Date.now() },

  // Traps
  { name: "Tardy Slip", rarity: "common", archetype: "mixed", cardType: "trap", cost: 1, trapType: "normal", isActive: true, ability: "Negate an attack", createdAt: Date.now() },
  { name: "Detention Notice", rarity: "uncommon", archetype: "geek", cardType: "trap", cost: 2, trapType: "normal", isActive: true, ability: "Destroy 1 attacking stereotype", createdAt: Date.now() },
  { name: "Food Fight", rarity: "rare", archetype: "dropout", cardType: "trap", cost: 3, trapType: "counter", isActive: true, ability: "Deal 500 damage to opponent", createdAt: Date.now() },
];

const STARTER_DECKS = [
  { name: "Geek Squad", deckCode: "geek_starter", archetype: "geek", description: "Strategy and defense", playstyle: "Control", cardCount: 40, isAvailable: true, createdAt: Date.now() },
  { name: "Dropout Gang", deckCode: "dropout_starter", archetype: "dropout", description: "Fast and aggressive", playstyle: "Aggro", cardCount: 40, isAvailable: true, createdAt: Date.now() },
  { name: "Mixed Lunch", deckCode: "mixed_starter", archetype: "mixed", description: "Balanced all-rounder", playstyle: "Midrange", cardCount: 40, isAvailable: true, createdAt: Date.now() },
];

const CHAPTERS = [
  { actNumber: 1, chapterNumber: 1, title: "Welcome to the Table", description: "Your first day at Lunchtable Academy.", archetype: "mixed", battleCount: 3, status: "published" as const, isActive: true, unlockRequirements: { minimumLevel: 1 }, baseRewards: { gold: 50, xp: 25 } },
];

const CHAPTER_1_STAGES = (chapterId: string) => [
  { chapterId, stageNumber: 1, name: "First Steps", description: "A practice match.", opponentName: "Training Dummy", aiDifficulty: "easy", rewardGold: 30, rewardXp: 15, firstClearBonus: 50, status: "published" as const },
  { chapterId, stageNumber: 2, name: "Lunch Rush", description: "The cafeteria is buzzing.", opponentName: "Cafeteria Kid", aiDifficulty: "easy", rewardGold: 40, rewardXp: 20, firstClearBonus: 75, status: "published" as const },
  { chapterId, stageNumber: 3, name: "Hall Monitor Showdown", description: "Time to dethrone them.", opponentName: "Hall Monitor Max", aiDifficulty: "medium", rewardGold: 60, rewardXp: 30, firstClearBonus: 100, status: "published" as const },
];
```

**Step 2: Deploy and run seed**

```bash
bunx convex dev --once --typecheck=disable
bunx convex run seed:seedAll
```

**Step 3: Commit**

```bash
git add convex/seed.ts
git commit -m "feat: seed module — card definitions, starter decks, story chapter 1"
```

---

### Task 5: Update frontend to point at new API

**Files:**
- Modify: `apps/web/src/lib/convexHelpers.ts`
- Modify: `apps/web/src/hooks/story/useStoryMode.ts`
- Modify: `apps/web/src/hooks/story/useStoryChapter.ts`
- Modify: frontend game board hooks to use new match-based API

The frontend hooks currently reference `typedApi.progression.story.*` and `typedApi.progression.storyBattle.*`. The new API is flat: `api.game.getChapters`, `api.game.startStoryBattle`, etc.

**Step 1: Update `convexHelpers.ts`**

The existing `typedApi` pattern (casting `api as any`) still works. The new paths are just `api.game.*` and `api.auth.*` instead of the deep nesting.

**Step 2: Update story hooks**

Update `useStoryMode.ts` to call `api.game.getChapters` and `api.game.getStoryProgress`.

Update `useStoryChapter.ts` to call `api.game.getChapterStages` and `api.game.startStoryBattle`.

**Step 3: Update game board**

The game board needs to:
- Call `api.game.getPlayerView(matchId, "host")` to get masked state
- Call `api.game.submitAction(matchId, command, "host")` to take actions
- Call `api.game.getRecentEvents(matchId, sinceVersion)` to poll events

The PlayerView type from the engine defines the shape of the response.

**Step 4: Commit**

```bash
git add apps/web/src/
git commit -m "feat: update frontend hooks to use new flat game API"
```

---

### Task 6: End-to-end verification

**Step 1: Start dev servers**

```bash
bunx convex dev &
cd apps/web && bun dev
```

**Step 2: Test flow**

1. Login via Privy → syncUser creates user record
2. Select starter deck → cards seeded, deck assigned
3. Navigate to `/play/story` → chapters load from story component
4. Click chapter → stages load
5. Click "Start Battle" → match created, initial state persisted
6. Game board renders → getPlayerView returns masked state
7. Submit action → match.submitAction processes via engine
8. AI takes turn → scheduled mutation fires
9. Game completes → match status = "ended"

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: LTCG v2 MVP — cards + story mode, component-driven"
```

---

## Summary

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `convex/convex.config.ts` | Register 3 components | ~10 |
| `convex/schema.ts` | Users table only | ~15 |
| `convex/auth.ts` | Privy auth sync | ~40 |
| `convex/game.ts` | All game logic orchestration | ~200 |
| `convex/seed.ts` | Card + story seed data | ~100 |
| **Total backend** | | **~365** |

Compare to old: `convex/schema.ts` alone was 1,890 lines. The entire old `convex/` directory was thousands of files.
