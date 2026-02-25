/// <reference types="vite/client" />
import { expect, test, describe, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { setupTestConvex, seedUser, ALICE, BOB, CHARLIE } from "./setup.test-helpers";

vi.setConfig({ testTimeout: 20_000 });

// ═══════════════════════════════════════════════════════════════════════
// ranked.ts + matchmaking.ts integration tests
// Covers: ELO edge cases, getMyRating, getLeaderboard, getPlayerRank,
//         getRankDistribution, matchmaking queue, and internal mutations.
// ═══════════════════════════════════════════════════════════════════════

// ── Helpers ─────────────────────────────────────────────────────────

/** Insert a playerRatings row directly via t.run. */
async function insertRating(
  t: ReturnType<typeof setupTestConvex>,
  userId: any,
  overrides: {
    rating?: number;
    peakRating?: number;
    tier?: "bronze" | "silver" | "gold" | "platinum" | "diamond";
    gamesPlayed?: number;
    ratingHistory?: any[];
  } = {},
) {
  const now = Date.now();
  return t.run(async (ctx: any) => {
    return ctx.db.insert("playerRatings", {
      userId,
      rating: overrides.rating ?? 1000,
      peakRating: overrides.peakRating ?? overrides.rating ?? 1000,
      tier: overrides.tier ?? "bronze",
      gamesPlayed: overrides.gamesPlayed ?? 0,
      ratingHistory: overrides.ratingHistory ?? [],
      updatedAt: now,
      createdAt: now,
    });
  });
}

/** Resolve a user doc from DB by privyId. */
async function getUser(t: ReturnType<typeof setupTestConvex>, subject: string) {
  return t.run(async (ctx: any) =>
    ctx.db
      .query("users")
      .withIndex("by_privyId", (q: any) => q.eq("privyId", subject))
      .first(),
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ELO edge cases
// ═══════════════════════════════════════════════════════════════════════

describe("ELO edge cases", () => {
  test("K=16 for players with >= 20 games", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);

    // Seed both players with gamesPlayed=20 so they use K_FACTOR_ESTABLISHED=16
    await insertRating(t, aliceUser!._id, { gamesPlayed: 20 });
    await insertRating(t, bobUser!._id, { gamesPlayed: 20 });

    const result = await t.mutation(internal.ranked.updateRatings, {
      winnerId: aliceUser!._id,
      loserId: bobUser!._id,
    });

    // At equal ratings (1000 vs 1000), expected=0.5, change = K*(1-0.5) = 16*0.5 = 8
    expect(result.winnerChange).toBe(8);
    expect(result.loserChange).toBe(-8);

    // Confirm this is smaller than the K=32 case (which would produce +16/-16)
    expect(Math.abs(result.winnerChange)).toBeLessThan(16);
  });

  test("rating floor at 0 (never negative)", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);

    // Alice starts at 10 rating, Bob at 1000 (same default).
    // With equal-ish ratings the loser drops by 16, so 10-16 = -6 -> clamped to 0.
    await insertRating(t, aliceUser!._id, { rating: 10, peakRating: 1000 });
    await insertRating(t, bobUser!._id, { rating: 10, peakRating: 1000 });

    // Bob wins — Alice should be clamped at 0 (10 - 16 < 0)
    const result = await t.mutation(internal.ranked.updateRatings, {
      winnerId: bobUser!._id,
      loserId: aliceUser!._id,
    });

    expect(result.loserNewRating).toBeGreaterThanOrEqual(0);
    expect(result.loserNewRating).toBe(0);
  });

  test("peak rating only increases", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);

    // Round 1: Alice wins — peakRating should increase
    const result1 = await t.mutation(internal.ranked.updateRatings, {
      winnerId: aliceUser!._id,
      loserId: bobUser!._id,
    });

    const peakAfterWin = result1.winnerNewRating;

    // Round 2: Alice loses — peakRating must stay at peakAfterWin
    await t.mutation(internal.ranked.updateRatings, {
      winnerId: bobUser!._id,
      loserId: aliceUser!._id,
    });

    const aliceRatingRow = await t.run(async (ctx: any) =>
      ctx.db
        .query("playerRatings")
        .withIndex("by_userId", (q: any) => q.eq("userId", aliceUser!._id))
        .unique(),
    );

    expect(aliceRatingRow!.peakRating).toBeGreaterThanOrEqual(peakAfterWin);
    // After losing, the current rating is lower but peakRating did not shrink
    expect(aliceRatingRow!.rating).toBeLessThan(aliceRatingRow!.peakRating);
  });

  test("tier transitions at boundaries (bronze -> silver at 1100)", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);

    // Alice at 1099 (still bronze), Bob at 100 (very weak opponent)
    // With K=32, Alice winning vs 100-rated opponent gains very few points,
    // so put Bob at a rating that ensures Alice crosses 1100 with one win.
    // At 1099 vs 100: expected = 1/(1+10^((100-1099)/400)) ≈ ~1, change minimal.
    // Instead, place Alice just below threshold and Bob low enough that Alice gains ~16.
    // Equal ratings: Alice at 1084, Bob at 1084 -> Alice wins, gains 16 -> 1100.
    await insertRating(t, aliceUser!._id, { rating: 1084, tier: "bronze" });
    await insertRating(t, bobUser!._id, { rating: 1084, tier: "bronze" });

    const result = await t.mutation(internal.ranked.updateRatings, {
      winnerId: aliceUser!._id,
      loserId: bobUser!._id,
    });

    // Alice should now be at >= 1100, triggering silver tier
    expect(result.winnerNewRating).toBeGreaterThanOrEqual(1100);

    const aliceRow = await t.run(async (ctx: any) =>
      ctx.db
        .query("playerRatings")
        .withIndex("by_userId", (q: any) => q.eq("userId", aliceUser!._id))
        .unique(),
    );

    expect(aliceRow!.tier).toBe("silver");
  });

  test("rating history truncates at 20 entries", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);

    // Seed Alice with 19 history entries already present
    const existingHistory = Array.from({ length: 19 }, (_, i) => ({
      rating: 1000 + i,
      change: 1,
      opponentRating: 1000,
      result: "win" as const,
      timestamp: Date.now() - (19 - i) * 1000,
    }));

    await insertRating(t, aliceUser!._id, { ratingHistory: existingHistory });
    await insertRating(t, bobUser!._id);

    // First updateRatings call — now history should be exactly 20
    await t.mutation(internal.ranked.updateRatings, {
      winnerId: aliceUser!._id,
      loserId: bobUser!._id,
    });

    const aliceRow1 = await t.run(async (ctx: any) =>
      ctx.db
        .query("playerRatings")
        .withIndex("by_userId", (q: any) => q.eq("userId", aliceUser!._id))
        .unique(),
    );
    expect(aliceRow1!.ratingHistory.length).toBeLessThanOrEqual(20);

    // Second call — should still be capped at 20
    await t.mutation(internal.ranked.updateRatings, {
      winnerId: aliceUser!._id,
      loserId: bobUser!._id,
    });

    const aliceRow2 = await t.run(async (ctx: any) =>
      ctx.db
        .query("playerRatings")
        .withIndex("by_userId", (q: any) => q.eq("userId", aliceUser!._id))
        .unique(),
    );
    expect(aliceRow2!.ratingHistory.length).toBeLessThanOrEqual(20);
  });

  test("new player defaults to 1000 rating when no row exists", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);

    // Neither player has a rating row — updateRatings should create them at 1000
    const result = await t.mutation(internal.ranked.updateRatings, {
      winnerId: aliceUser!._id,
      loserId: bobUser!._id,
    });

    // Starting at 1000 vs 1000, K=32, expected=0.5 -> change=+16/-16
    expect(result.winnerNewRating).toBe(1016);
    expect(result.loserNewRating).toBe(984);
  });

  test("win/loss with same rating is symmetric", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);

    // Both at exactly 1200 rating
    await insertRating(t, aliceUser!._id, { rating: 1200, tier: "silver" });
    await insertRating(t, bobUser!._id, { rating: 1200, tier: "silver" });

    const result = await t.mutation(internal.ranked.updateRatings, {
      winnerId: aliceUser!._id,
      loserId: bobUser!._id,
    });

    // Winner gains = abs(loser loses)
    expect(result.winnerChange).toBe(Math.abs(result.loserChange));
    expect(result.winnerChange).toBeGreaterThan(0);
    expect(result.loserChange).toBeLessThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getMyRating
// ═══════════════════════════════════════════════════════════════════════

describe("getMyRating", () => {
  test("returns default for unrated player", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    const result = await asAlice.query(api.ranked.getMyRating, {});

    expect(result.rating).toBe(1000);
    expect(result.tier).toBe("bronze");
    expect(result.gamesPlayed).toBe(0);
    expect(result.ratingHistory).toEqual([]);
  });

  test("returns actual rating after games", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getUser(t, ALICE.subject);

    await insertRating(t, aliceUser!._id, {
      rating: 1350,
      peakRating: 1400,
      tier: "gold",
      gamesPlayed: 42,
    });

    const result = await asAlice.query(api.ranked.getMyRating, {});

    expect(result.rating).toBe(1350);
    expect(result.tier).toBe("gold");
    expect(result.gamesPlayed).toBe(42);
    expect(result.peakRating).toBe(1400);
  });

  test("requires authentication", async () => {
    const t = setupTestConvex();

    await expect(t.query(api.ranked.getMyRating, {})).rejects.toThrow();
  });

  test("includes ratingHistory entries", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getUser(t, ALICE.subject);

    const history = [
      { rating: 1016, change: 16, opponentRating: 1000, result: "win" as const, timestamp: Date.now() - 2000 },
      { rating: 1000, change: -16, opponentRating: 1016, result: "loss" as const, timestamp: Date.now() - 1000 },
    ];

    await insertRating(t, aliceUser!._id, { ratingHistory: history });

    const result = await asAlice.query(api.ranked.getMyRating, {});

    expect(result.ratingHistory).toHaveLength(2);
    expect(result.ratingHistory[0].result).toBe("win");
    expect(result.ratingHistory[1].result).toBe("loss");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getLeaderboard
// ═══════════════════════════════════════════════════════════════════════

describe("getLeaderboard", () => {
  test("returns players sorted by rating desc", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);
    const asCharlie = await seedUser(t, CHARLIE, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);
    const charlieUser = await getUser(t, CHARLIE.subject);

    await insertRating(t, aliceUser!._id, { rating: 1200, tier: "silver" });
    await insertRating(t, bobUser!._id, { rating: 1500, tier: "platinum" });
    await insertRating(t, charlieUser!._id, { rating: 900, tier: "bronze" });

    const leaderboard = await t.query(api.ranked.getLeaderboard, {});

    expect(leaderboard.length).toBe(3);
    expect(leaderboard[0].rating).toBe(1500); // Bob highest
    expect(leaderboard[1].rating).toBe(1200); // Alice middle
    expect(leaderboard[2].rating).toBe(900);  // Charlie lowest
  });

  test("respects limit parameter", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);
    const asCharlie = await seedUser(t, CHARLIE, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);
    const charlieUser = await getUser(t, CHARLIE.subject);

    await insertRating(t, aliceUser!._id, { rating: 1200, tier: "silver" });
    await insertRating(t, bobUser!._id, { rating: 1500, tier: "platinum" });
    await insertRating(t, charlieUser!._id, { rating: 900, tier: "bronze" });

    const leaderboard = await t.query(api.ranked.getLeaderboard, { limit: 2 });

    expect(leaderboard.length).toBe(2);
    expect(leaderboard[0].rating).toBe(1500);
    expect(leaderboard[1].rating).toBe(1200);
  });

  test("defaults to up to 50 results when no limit provided", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getUser(t, ALICE.subject);

    await insertRating(t, aliceUser!._id, { rating: 1100, tier: "silver" });

    // No limit arg — should not throw and should return results
    const leaderboard = await t.query(api.ranked.getLeaderboard, {});

    expect(Array.isArray(leaderboard)).toBe(true);
    expect(leaderboard.length).toBeGreaterThan(0);
  });

  test("enriches entries with username", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    await asAlice.mutation(api.auth.setUsername, { username: "ranked_alice" });

    const aliceUser = await getUser(t, ALICE.subject);
    await insertRating(t, aliceUser!._id, { rating: 1200, tier: "silver" });

    const leaderboard = await t.query(api.ranked.getLeaderboard, {});

    const aliceEntry = leaderboard.find((e: any) => e.userId === aliceUser!._id);
    expect(aliceEntry).toBeDefined();
    expect(aliceEntry!.username).toBe("ranked_alice");
  });

  test("shows 'Unknown' for username when user row is missing", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getUser(t, ALICE.subject);

    await insertRating(t, aliceUser!._id, { rating: 1200, tier: "silver" });

    // Delete the user row to simulate orphaned rating
    await t.run(async (ctx: any) => {
      await ctx.db.delete(aliceUser!._id);
    });

    const leaderboard = await t.query(api.ranked.getLeaderboard, {});

    const entry = leaderboard.find((e: any) => e.userId === aliceUser!._id);
    expect(entry).toBeDefined();
    expect(entry!.username).toBe("Unknown");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getPlayerRank
// ═══════════════════════════════════════════════════════════════════════

describe("getPlayerRank", () => {
  test("returns rank 1 for highest (and only) rated player", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getUser(t, ALICE.subject);

    await insertRating(t, aliceUser!._id, { rating: 1200, tier: "silver" });

    const result = await asAlice.query(api.ranked.getPlayerRank, {});

    expect(result.rank).toBe(1);
    expect(result.rating).toBe(1200);
  });

  test("returns correct rank with multiple players", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);
    const asCharlie = await seedUser(t, CHARLIE, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);
    const charlieUser = await getUser(t, CHARLIE.subject);

    // Alice=1200, Bob=1100, Charlie=1000
    await insertRating(t, aliceUser!._id, { rating: 1200, tier: "silver" });
    await insertRating(t, bobUser!._id, { rating: 1100, tier: "silver" });
    await insertRating(t, charlieUser!._id, { rating: 1000, tier: "bronze" });

    const bobRank = await asBob.query(api.ranked.getPlayerRank, {});

    // Alice (1200) is above Bob (1100), so Bob is rank 2
    expect(bobRank.rank).toBe(2);
    expect(bobRank.rating).toBe(1100);
  });

  test("returns null rank for unrated player", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    // No rating row inserted for Alice
    const result = await asAlice.query(api.ranked.getPlayerRank, {});

    expect(result.rank).toBeNull();
    expect(result.rating).toBe(1000); // Default
    expect(result.tier).toBe("bronze");
  });

  test("requires authentication", async () => {
    const t = setupTestConvex();

    await expect(t.query(api.ranked.getPlayerRank, {})).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getRankDistribution
// ═══════════════════════════════════════════════════════════════════════

describe("getRankDistribution", () => {
  test("counts players per tier correctly", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);
    const asCharlie = await seedUser(t, CHARLIE, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);
    const charlieUser = await getUser(t, CHARLIE.subject);

    // 2 bronze, 1 silver
    await insertRating(t, aliceUser!._id, { rating: 900, tier: "bronze" });
    await insertRating(t, bobUser!._id, { rating: 1000, tier: "bronze" });
    await insertRating(t, charlieUser!._id, { rating: 1150, tier: "silver" });

    const result = await t.query(api.ranked.getRankDistribution, {});

    expect(result.distribution.bronze).toBe(2);
    expect(result.distribution.silver).toBe(1);
    expect(result.distribution.gold).toBe(0);
    expect(result.distribution.platinum).toBe(0);
    expect(result.distribution.diamond).toBe(0);
    expect(result.totalPlayers).toBe(3);
  });

  test("returns all zeros when no players exist", async () => {
    const t = setupTestConvex();

    const result = await t.query(api.ranked.getRankDistribution, {});

    expect(result.distribution.bronze).toBe(0);
    expect(result.distribution.silver).toBe(0);
    expect(result.distribution.gold).toBe(0);
    expect(result.distribution.platinum).toBe(0);
    expect(result.distribution.diamond).toBe(0);
    expect(result.totalPlayers).toBe(0);
  });

  test("totalPlayers matches sum of all tier counts", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);
    const asCharlie = await seedUser(t, CHARLIE, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);
    const charlieUser = await getUser(t, CHARLIE.subject);

    await insertRating(t, aliceUser!._id, { rating: 900, tier: "bronze" });
    await insertRating(t, bobUser!._id, { rating: 1300, tier: "gold" });
    await insertRating(t, charlieUser!._id, { rating: 1700, tier: "diamond" });

    const result = await t.query(api.ranked.getRankDistribution, {});

    const tierSum =
      result.distribution.bronze +
      result.distribution.silver +
      result.distribution.gold +
      result.distribution.platinum +
      result.distribution.diamond;

    expect(tierSum).toBe(result.totalPlayers);
    expect(result.totalPlayers).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Matchmaking
// ═══════════════════════════════════════════════════════════════════════

describe.sequential("matchmaking - rating window", () => {
  test("immediate match within rating window", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const starters = await t.query(api.game.getStarterDecks, {});
    const { deckId: aliceDeckId } = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });
    const { deckId: bobDeckId } = await asBob.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    // Alice joins first — she queues (no one to match)
    const aliceJoin = await asAlice.mutation(api.matchmaking.joinRankedQueue, {
      deckId: aliceDeckId,
    });
    expect(aliceJoin.queued).toBe(true);

    // Bob joins second — both at default 1000, well within 200-point window
    const bobJoin = await asBob.mutation(api.matchmaking.joinRankedQueue, {
      deckId: bobDeckId,
    });

    // Bob gets an immediate match
    expect(bobJoin.queued).toBe(false);
    expect(bobJoin.matchId).toBeDefined();
  });

  test("no match outside initial rating window", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);

    const starters = await t.query(api.game.getStarterDecks, {});
    const { deckId: aliceDeckId } = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });
    const { deckId: bobDeckId } = await asBob.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    // Set explicit ratings: Alice at 1500, Bob at 100 — 1400 points apart,
    // exceeding the base window of 200 and the max window of 500.
    await insertRating(t, aliceUser!._id, { rating: 1500, tier: "platinum" });
    await insertRating(t, bobUser!._id, { rating: 100, tier: "bronze" });

    // Alice joins the queue first
    const aliceJoin = await asAlice.mutation(api.matchmaking.joinRankedQueue, {
      deckId: aliceDeckId,
    });
    expect(aliceJoin.queued).toBe(true);

    // Bob joins — rating gap is too large, no match
    const bobJoin = await asBob.mutation(api.matchmaking.joinRankedQueue, {
      deckId: bobDeckId,
    });
    expect(bobJoin.queued).toBe(true);
    expect(bobJoin.matchId).toBeUndefined();
  });

  test("cleanupExpiredEntries marks old entries as expired", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getUser(t, ALICE.subject);

    // Insert a queue entry with joinedAt 6 minutes ago (beyond 5-min expiry)
    const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
    const entryId = await t.run(async (ctx: any) => {
      return ctx.db.insert("rankedQueue", {
        userId: aliceUser!._id,
        rating: 1000,
        deckId: "some-deck-id",
        status: "waiting",
        joinedAt: sixMinutesAgo,
      });
    });

    // Run cleanup
    await t.mutation(internal.matchmaking.cleanupExpiredEntries, {});

    // Verify entry is now expired
    const entry = await t.run(async (ctx: any) => ctx.db.get(entryId));
    expect(entry!.status).toBe("expired");
  });

  test("createRankedMatch creates active pvpLobby", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const aliceUser = await getUser(t, ALICE.subject);
    const bobUser = await getUser(t, BOB.subject);

    const matchId = `ranked_test_${Date.now()}`;

    await t.mutation(internal.matchmaking.createRankedMatch, {
      hostUserId: aliceUser!._id,
      awayUserId: bobUser!._id,
      hostDeckId: "deck-a",
      awayDeckId: "deck-b",
      matchId,
    });

    const lobby = await t.run(async (ctx: any) =>
      ctx.db
        .query("pvpLobbies")
        .withIndex("by_matchId", (q: any) => q.eq("matchId", matchId))
        .first(),
    );

    expect(lobby).toBeTruthy();
    expect(lobby!.status).toBe("active");
    expect(lobby!.matchId).toBe(matchId);
    expect(lobby!.mode).toBe("pvp");
  });

  test("leaveRankedQueue marks entry as expired", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);

    const starters = await t.query(api.game.getStarterDecks, {});
    const { deckId } = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    // Join queue
    await asAlice.mutation(api.matchmaking.joinRankedQueue, { deckId });

    // Confirm in queue
    const statusBefore = await asAlice.query(api.matchmaking.getQueueStatus, {});
    expect(statusBefore.inQueue).toBe(true);

    // Leave queue
    await asAlice.mutation(api.matchmaking.leaveRankedQueue, {});

    // Verify no longer in queue
    const statusAfter = await asAlice.query(api.matchmaking.getQueueStatus, {});
    expect(statusAfter.inQueue).toBe(false);

    // Verify the DB row is explicitly "expired"
    const aliceUser = await getUser(t, ALICE.subject);
    const queueEntry = await t.run(async (ctx: any) =>
      ctx.db
        .query("rankedQueue")
        .withIndex("by_userId", (q: any) => q.eq("userId", aliceUser!._id))
        .first(),
    );

    expect(queueEntry).toBeTruthy();
    expect(queueEntry!.status).toBe("expired");
  });
});
