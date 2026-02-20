import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireUser } from "./auth";

// ── Constants ──────────────────────────────────────────────────

const DEFAULT_RATING = 1000;
const K_FACTOR_NEW = 32;       // K=32 for players with < 20 games
const K_FACTOR_ESTABLISHED = 16; // K=16 for established players
const RATING_HISTORY_MAX = 20;  // Keep last 20 rating changes

// Tier thresholds
const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 1100,
  gold: 1300,
  platinum: 1500,
  diamond: 1700,
} as const;

type Tier = keyof typeof TIER_THRESHOLDS;

function calculateTier(rating: number): Tier {
  if (rating >= TIER_THRESHOLDS.diamond) return "diamond";
  if (rating >= TIER_THRESHOLDS.platinum) return "platinum";
  if (rating >= TIER_THRESHOLDS.gold) return "gold";
  if (rating >= TIER_THRESHOLDS.silver) return "silver";
  return "bronze";
}

// Standard ELO calculation
function calculateExpectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

function calculateRatingChange(
  playerRating: number,
  opponentRating: number,
  won: boolean,
  gamesPlayed: number,
): number {
  const k = gamesPlayed < 20 ? K_FACTOR_NEW : K_FACTOR_ESTABLISHED;
  const expected = calculateExpectedScore(playerRating, opponentRating);
  const actual = won ? 1 : 0;
  return Math.round(k * (actual - expected));
}

// ── Queries ──────────────────────────────────────────────────

/**
 * Get the current user's rating.
 */
export const getMyRating = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rating = await ctx.db
      .query("playerRatings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!rating) {
      return {
        userId: user._id,
        rating: DEFAULT_RATING,
        peakRating: DEFAULT_RATING,
        tier: "bronze" as Tier,
        gamesPlayed: 0,
        ratingHistory: [],
      };
    }

    return rating;
  },
});

/**
 * Get a player's rating by userId.
 */
export const getRatingByUserId = internalQuery({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return ctx.db
      .query("playerRatings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Leaderboard: top N players by rating.
 */
export const getLeaderboard = query({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    // Use by_rating index, descending
    const ratings = await ctx.db
      .query("playerRatings")
      .withIndex("by_rating")
      .order("desc")
      .take(limit);

    // Enrich with usernames
    const enriched = [];
    for (const r of ratings) {
      const user = await ctx.db.get(r.userId);
      enriched.push({
        userId: r.userId,
        username: user?.username ?? "Unknown",
        rating: r.rating,
        tier: r.tier,
        gamesPlayed: r.gamesPlayed,
        peakRating: r.peakRating,
      });
    }
    return enriched;
  },
});

/**
 * Get the current user's rank position on the leaderboard.
 */
export const getPlayerRank = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const myRating = await ctx.db
      .query("playerRatings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!myRating) {
      return { userId: user._id, rank: null, rating: DEFAULT_RATING, tier: "bronze", gamesPlayed: 0 };
    }

    // Count players with higher rating
    const higherRated = await ctx.db
      .query("playerRatings")
      .withIndex("by_rating")
      .filter((q) => q.gt(q.field("rating"), myRating.rating))
      .collect();

    return {
      userId: user._id,
      rank: higherRated.length + 1,
      rating: myRating.rating,
      peakRating: myRating.peakRating,
      tier: myRating.tier,
      gamesPlayed: myRating.gamesPlayed,
      ratingHistory: myRating.ratingHistory,
    };
  },
});

/**
 * Get the distribution of players across tiers.
 */
export const getRankDistribution = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const all = await ctx.db.query("playerRatings").collect();
    const dist = { bronze: 0, silver: 0, gold: 0, platinum: 0, diamond: 0 };
    for (const r of all) {
      dist[r.tier as keyof typeof dist] =
        (dist[r.tier as keyof typeof dist] ?? 0) + 1;
    }
    return { distribution: dist, totalPlayers: all.length };
  },
});

// ── Mutations ──────────────────────────────────────────────────

/**
 * Internal: update ratings after a PvP match.
 * Creates rating rows for new players.
 */
export const updateRatings = internalMutation({
  args: {
    winnerId: v.id("users"),
    loserId: v.id("users"),
  },
  returns: v.object({
    winnerChange: v.number(),
    loserChange: v.number(),
    winnerNewRating: v.number(),
    loserNewRating: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get or create winner rating
    let winnerRating = await ctx.db
      .query("playerRatings")
      .withIndex("by_userId", (q) => q.eq("userId", args.winnerId))
      .unique();

    if (!winnerRating) {
      const id = await ctx.db.insert("playerRatings", {
        userId: args.winnerId,
        rating: DEFAULT_RATING,
        peakRating: DEFAULT_RATING,
        tier: "bronze",
        gamesPlayed: 0,
        ratingHistory: [],
        updatedAt: now,
        createdAt: now,
      });
      winnerRating = (await ctx.db.get(id))!;
    }

    // Get or create loser rating
    let loserRating = await ctx.db
      .query("playerRatings")
      .withIndex("by_userId", (q) => q.eq("userId", args.loserId))
      .unique();

    if (!loserRating) {
      const id = await ctx.db.insert("playerRatings", {
        userId: args.loserId,
        rating: DEFAULT_RATING,
        peakRating: DEFAULT_RATING,
        tier: "bronze",
        gamesPlayed: 0,
        ratingHistory: [],
        updatedAt: now,
        createdAt: now,
      });
      loserRating = (await ctx.db.get(id))!;
    }

    // Calculate changes
    const winnerChange = calculateRatingChange(
      winnerRating.rating,
      loserRating.rating,
      true,
      winnerRating.gamesPlayed,
    );
    const loserChange = calculateRatingChange(
      loserRating.rating,
      winnerRating.rating,
      false,
      loserRating.gamesPlayed,
    );

    const winnerNewRating = Math.max(0, winnerRating.rating + winnerChange);
    const loserNewRating = Math.max(0, loserRating.rating + loserChange);

    // Update winner
    const winnerHistory = [
      {
        rating: winnerNewRating,
        change: winnerChange,
        opponentRating: loserRating.rating,
        result: "win" as const,
        timestamp: now,
      },
      ...winnerRating.ratingHistory,
    ].slice(0, RATING_HISTORY_MAX);

    await ctx.db.patch(winnerRating._id, {
      rating: winnerNewRating,
      peakRating: Math.max(winnerRating.peakRating, winnerNewRating),
      tier: calculateTier(winnerNewRating),
      gamesPlayed: winnerRating.gamesPlayed + 1,
      ratingHistory: winnerHistory,
      updatedAt: now,
    });

    // Update loser
    const loserHistory = [
      {
        rating: loserNewRating,
        change: loserChange,
        opponentRating: winnerRating.rating,
        result: "loss" as const,
        timestamp: now,
      },
      ...loserRating.ratingHistory,
    ].slice(0, RATING_HISTORY_MAX);

    await ctx.db.patch(loserRating._id, {
      rating: loserNewRating,
      tier: calculateTier(loserNewRating),
      gamesPlayed: loserRating.gamesPlayed + 1,
      ratingHistory: loserHistory,
      updatedAt: now,
    });

    return {
      winnerChange,
      loserChange,
      winnerNewRating,
      loserNewRating,
    };
  },
});
