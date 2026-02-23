import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./auth";
import { LTCGCards } from "@lunchtable/cards";

const cards: any = new LTCGCards(components.lunchtable_tcg_cards as any);
const RANDOM_UINT32_RANGE = 0x1_0000_0000;

function secureRandomInt(maxExclusive: number) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new ConvexError("Invalid secure random bound.");
  }

  const sample = new Uint32Array(1);
  const rejectionThreshold = Math.floor(RANDOM_UINT32_RANGE / maxExclusive) * maxExclusive;
  let value = 0;
  do {
    crypto.getRandomValues(sample);
    value = sample[0] ?? 0;
  } while (value >= rejectionThreshold);
  return value % maxExclusive;
}

// ── Pack definitions ───────────────────────────────────────────────
const PACK_TYPES = {
  basic: {
    name: "Basic Pack",
    cardCount: 5,
    rarityWeights: {
      common: 60,
      uncommon: 25,
      rare: 10,
      epic: 4,
      legendary: 1,
    },
    cost: 200,
  },
  premium: {
    name: "Premium Pack",
    cardCount: 5,
    rarityWeights: {
      common: 30,
      uncommon: 30,
      rare: 25,
      epic: 12,
      legendary: 3,
    },
    cost: 500,
  },
  legendary: {
    name: "Legendary Pack",
    cardCount: 3,
    rarityWeights: {
      common: 0,
      uncommon: 10,
      rare: 30,
      epic: 40,
      legendary: 20,
    },
    cost: 1500,
  },
} as const;

type PackType = keyof typeof PACK_TYPES;

/**
 * Weighted random rarity picker.
 * Filters out zero-weight entries, rolls against cumulative total.
 */
function pickRarity(weights: Record<string, number>): string {
  const entries = Object.entries(weights).filter(([_, w]) => w > 0);
  const total = entries.reduce((sum, [_, w]) => sum + w, 0);
  if (total <= 0 || entries.length === 0) {
    throw new ConvexError("Pack rarity weights are invalid.");
  }

  let roll = secureRandomInt(total) + 1;
  for (const [rarity, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return entries[entries.length - 1]![0];
}

// ── Shared pack-rolling logic ──────────────────────────────────────

async function rollPackCards(
  ctx: any,
  userId: string,
  packType: PackType,
  source: string,
) {
  const pack = PACK_TYPES[packType];

  // Fetch all active card definitions from the cards component
  const allCards = await cards.cards.getAllCards(ctx);
  if (!allCards || allCards.length === 0) {
    throw new ConvexError("No cards available in the catalog");
  }

  // Group by rarity for weighted selection
  const cardsByRarity: Record<string, any[]> = {};
  for (const card of allCards) {
    const rarity = card.rarity ?? "common";
    if (!cardsByRarity[rarity]) cardsByRarity[rarity] = [];
    cardsByRarity[rarity]!.push(card);
  }

  const pulledCards: { cardDefinitionId: string; name: string; rarity: string }[] = [];

  for (let i = 0; i < pack.cardCount; i++) {
    const rarity = pickRarity(pack.rarityWeights);
    // Fall back to common pool, then to all cards if the rarity pool is empty
    const pool = cardsByRarity[rarity] ?? cardsByRarity["common"] ?? allCards;
    const card = pool[secureRandomInt(pool.length)];
    if (card) {
      // Grant card to user's inventory via the cards component client
      await cards.cards.addCardsToInventory(ctx, {
        userId,
        cardDefinitionId: String(card._id),
        quantity: 1,
        source,
      });
      pulledCards.push({
        cardDefinitionId: String(card._id),
        name: card.name ?? "Unknown",
        rarity: card.rarity ?? "common",
      });
    }
  }

  return pulledCards;
}

// ── Mutations & Queries ────────────────────────────────────────────

/**
 * Open a pack: spend gold, receive random cards based on rarity weights.
 */
export const openPack = mutation({
  args: {
    packType: v.union(
      v.literal("basic"),
      v.literal("premium"),
      v.literal("legendary"),
    ),
  },
  returns: v.object({
    cards: v.array(
      v.object({
        cardDefinitionId: v.string(),
        name: v.string(),
        rarity: v.string(),
      }),
    ),
    goldSpent: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const pack = PACK_TYPES[args.packType];

    // Check gold balance
    const stats = await ctx.db
      .query("playerStats")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const currentGold = stats?.gold ?? 0;
    if (currentGold < pack.cost) {
      throw new ConvexError(
        `Not enough gold. Need ${pack.cost}, have ${currentGold}`,
      );
    }

    // Deduct gold
    if (stats) {
      await ctx.db.patch(stats._id, { gold: stats.gold - pack.cost });
    }

    const pulledCards = await rollPackCards(
      ctx,
      String(user._id),
      args.packType,
      `pack:${args.packType}`,
    );

    return { cards: pulledCards, goldSpent: pack.cost };
  },
});

/**
 * Internal: award a free pack (no gold cost) — used for story/pvp rewards.
 */
export const awardPack = internalMutation({
  args: {
    userId: v.id("users"),
    packType: v.union(
      v.literal("basic"),
      v.literal("premium"),
      v.literal("legendary"),
    ),
  },
  returns: v.array(
    v.object({
      cardDefinitionId: v.string(),
      name: v.string(),
      rarity: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    return await rollPackCards(
      ctx,
      String(args.userId),
      args.packType,
      `reward:${args.packType}`,
    );
  },
});

/**
 * Get pack prices/info for the shop UI.
 */
export const getPackInfo = query({
  args: {},
  returns: v.array(
    v.object({
      type: v.string(),
      name: v.string(),
      cardCount: v.number(),
      cost: v.number(),
    }),
  ),
  handler: async () => {
    return Object.entries(PACK_TYPES).map(([key, pack]) => ({
      type: key,
      name: pack.name,
      cardCount: pack.cardCount,
      cost: pack.cost,
    }));
  },
});

// ── Daily Login Bonus ──────────────────────────────────────────────

/**
 * Claim daily login bonus. Escalating gold: day 1=50, day 2=100, ..., day 7=350
 * plus a bonus 150 on day 7 (total 500). Streak resets after 7 or on missed day.
 */
export const claimDailyBonus = mutation({
  args: {},
  returns: v.object({
    goldAwarded: v.number(),
    newStreak: v.number(),
    isStreakReset: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // Get or create player stats
    let stats = await ctx.db
      .query("playerStats")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!stats) {
      // Bootstrap stats via internal mutation, then re-read
      await ctx.runMutation(internal.game.addRewards, {
        userId: user._id,
        gold: 0,
        xp: 0,
      });
      stats = await ctx.db
        .query("playerStats")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .unique();
    }

    if (!stats) throw new ConvexError("Unable to create player stats");

    // Check if already claimed today (UTC-based day boundary)
    const lastBonus = stats.lastLoginBonusAt ?? 0;
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    if (lastBonus >= startOfToday.getTime()) {
      throw new ConvexError("Daily bonus already claimed today");
    }

    // Determine streak continuity
    const startOfYesterday = new Date(startOfToday.getTime() - ONE_DAY);
    const isConsecutive = lastBonus >= startOfYesterday.getTime();
    const currentStreak = stats.dailyLoginStreak ?? 0;

    let newStreak: number;
    let isStreakReset = false;

    if (isConsecutive && currentStreak < 7) {
      newStreak = currentStreak + 1;
    } else if (currentStreak >= 7) {
      // Completed 7-day cycle, restart
      newStreak = 1;
      isStreakReset = true;
    } else {
      // Missed a day or first ever claim
      newStreak = 1;
      isStreakReset = currentStreak > 0;
    }

    // Gold escalation: day N = 50*N, day 7 gets +150 bonus (total 500)
    const baseGold = newStreak * 50;
    const bonusGold = newStreak === 7 ? 150 : 0;
    const goldAwarded = baseGold + bonusGold;

    await ctx.db.patch(stats._id, {
      gold: stats.gold + goldAwarded,
      dailyLoginStreak: newStreak,
      lastLoginBonusAt: now,
    });

    return { goldAwarded, newStreak, isStreakReset };
  },
});
