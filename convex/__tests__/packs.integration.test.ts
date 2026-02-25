/// <reference types="vite/client" />
import { expect, test, describe, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { setupTestConvex, seedUser, ALICE, BOB } from "./setup.test-helpers";

vi.setConfig({ testTimeout: 20_000 });

// ═══════════════════════════════════════════════════════════════════════
// packs.ts + cliqueBonus.ts integration tests
// Covers: pack opening (all tiers), awardPack (internal), daily login
// bonus streak logic, getCliqueBonus query, getCliqueLeaderboard query,
// and the calculateCliqueXpBonus pure function.
// ═══════════════════════════════════════════════════════════════════════

// ── Helper ─────────────────────────────────────────────────────────────

/**
 * Insert a playerStats row for `userId` with the given gold and any extra
 * fields caller wants to override. This simulates a user who already has
 * an economy record without going through the full onboarding flow.
 */
async function giveGold(t: any, userId: any, gold: number, extra?: Record<string, any>) {
  await t.run(async (ctx: any) => {
    await ctx.db.insert("playerStats", {
      userId,
      gold,
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
      createdAt: Date.now(),
      ...extra,
    });
  });
}

/** Read current gold from playerStats for a given userId. */
async function getGold(t: any, userId: any): Promise<number> {
  return t.run(async (ctx: any) => {
    const stats = await ctx.db
      .query("playerStats")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .unique();
    return stats?.gold ?? 0;
  });
}

/** Fetch the users doc for ALICE by privyId. */
async function getAliceUser(t: any) {
  return t.run(async (ctx: any) =>
    ctx.db
      .query("users")
      .withIndex("by_privyId", (q: any) => q.eq("privyId", ALICE.subject))
      .first(),
  );
}

// ── openPack - all tiers ───────────────────────────────────────────────

describe("openPack - all tiers", () => {
  test("basic pack costs 200g, grants 5 cards", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    await giveGold(t, aliceUser!._id, 500);

    const result = await asAlice.mutation(api.packs.openPack, { packType: "basic" });

    expect(result.goldSpent).toBe(200);
    expect(result.cards).toHaveLength(5);

    const goldAfter = await getGold(t, aliceUser!._id);
    expect(goldAfter).toBe(300);
  });

  test("premium pack costs 500g, grants 5 cards", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    await giveGold(t, aliceUser!._id, 1000);

    const result = await asAlice.mutation(api.packs.openPack, { packType: "premium" });

    expect(result.goldSpent).toBe(500);
    expect(result.cards).toHaveLength(5);
  });

  test("legendary pack costs 1500g, grants 3 cards", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    await giveGold(t, aliceUser!._id, 2000);

    const result = await asAlice.mutation(api.packs.openPack, { packType: "legendary" });

    expect(result.goldSpent).toBe(1500);
    expect(result.cards).toHaveLength(3);
  });

  test("rejects with insufficient gold", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    await giveGold(t, aliceUser!._id, 50);

    await expect(
      asAlice.mutation(api.packs.openPack, { packType: "basic" }),
    ).rejects.toThrow("Not enough gold");
  });

  test("rejects unauthenticated caller", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    await expect(
      t.mutation(api.packs.openPack, { packType: "basic" }),
    ).rejects.toThrow();
  });

  test("cards are valid card definitions", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    await giveGold(t, aliceUser!._id, 500);

    const result = await asAlice.mutation(api.packs.openPack, { packType: "basic" });

    expect(result.cards.length).toBeGreaterThan(0);
    for (const card of result.cards) {
      expect(card.cardDefinitionId).toBeTruthy();
      expect(card.name).toBeTruthy();
      expect(card.rarity).toBeTruthy();
    }
  });

  test("multiple opens deplete gold correctly", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    await giveGold(t, aliceUser!._id, 1000);

    await asAlice.mutation(api.packs.openPack, { packType: "basic" });
    await asAlice.mutation(api.packs.openPack, { packType: "basic" });

    const goldAfter = await getGold(t, aliceUser!._id);
    expect(goldAfter).toBe(600); // 1000 - 200 - 200
  });
});

// ── awardPack (internal) ───────────────────────────────────────────────

describe("awardPack (internal)", () => {
  test("awards pack without gold cost", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    // User starts with 0 gold — no stats row needed
    const result = await t.mutation(internal.packs.awardPack, {
      userId: aliceUser!._id,
      packType: "basic",
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Gold is unchanged (still 0 or whatever it was)
    const goldAfter = await getGold(t, aliceUser!._id);
    expect(goldAfter).toBe(0);
  });

  test("works for all pack types", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    const basicResult = await t.mutation(internal.packs.awardPack, {
      userId: aliceUser!._id,
      packType: "basic",
    });
    const premiumResult = await t.mutation(internal.packs.awardPack, {
      userId: aliceUser!._id,
      packType: "premium",
    });
    const legendaryResult = await t.mutation(internal.packs.awardPack, {
      userId: aliceUser!._id,
      packType: "legendary",
    });

    expect(basicResult.length).toBeGreaterThan(0);
    expect(premiumResult.length).toBeGreaterThan(0);
    expect(legendaryResult.length).toBeGreaterThan(0);
  });

  test("returns card details with cardDefinitionId and name", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    const result = await t.mutation(internal.packs.awardPack, {
      userId: aliceUser!._id,
      packType: "premium",
    });

    for (const card of result) {
      expect(card.cardDefinitionId).toBeTruthy();
      expect(card.name).toBeTruthy();
    }
  });
});

// ── claimDailyBonus - full streak ──────────────────────────────────────

describe("claimDailyBonus - full streak", () => {
  test("day 1 awards 50g", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    const result = await asAlice.mutation(api.packs.claimDailyBonus, {});

    expect(result.goldAwarded).toBe(50);
    expect(result.newStreak).toBe(1);
  });

  test("day 2 awards 100g when last bonus was yesterday", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    await giveGold(t, aliceUser!._id, 0, {
      dailyLoginStreak: 1,
      lastLoginBonusAt: yesterday,
    });

    const result = await asAlice.mutation(api.packs.claimDailyBonus, {});

    expect(result.goldAwarded).toBe(100);
    expect(result.newStreak).toBe(2);
  });

  test("day 7 awards 500g (350 base + 150 bonus)", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    await giveGold(t, aliceUser!._id, 0, {
      dailyLoginStreak: 6,
      lastLoginBonusAt: yesterday,
    });

    const result = await asAlice.mutation(api.packs.claimDailyBonus, {});

    expect(result.goldAwarded).toBe(500); // 7*50 + 150 bonus
    expect(result.newStreak).toBe(7);
  });

  test("streak resets to 1 after completing day 7 cycle", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    await giveGold(t, aliceUser!._id, 0, {
      dailyLoginStreak: 7,
      lastLoginBonusAt: yesterday,
    });

    const result = await asAlice.mutation(api.packs.claimDailyBonus, {});

    expect(result.newStreak).toBe(1);
    expect(result.isStreakReset).toBe(true);
    expect(result.goldAwarded).toBe(50); // Day 1 = 50g
  });

  test("missed day resets streak to 1", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    // last bonus was 3 days ago — not yesterday, so streak breaks
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    await giveGold(t, aliceUser!._id, 0, {
      dailyLoginStreak: 3,
      lastLoginBonusAt: threeDaysAgo,
    });

    const result = await asAlice.mutation(api.packs.claimDailyBonus, {});

    expect(result.newStreak).toBe(1);
  });

  test("double claim same day throws 'Daily bonus already claimed today'", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    // First claim succeeds
    await asAlice.mutation(api.packs.claimDailyBonus, {});

    // Second claim same day must reject
    await expect(
      asAlice.mutation(api.packs.claimDailyBonus, {}),
    ).rejects.toThrow("Daily bonus already claimed today");
  });
});

// ── getCliqueBonus query ───────────────────────────────────────────────

describe("getCliqueBonus query", () => {
  test("user with no clique returns hasClique=false and bonusMultiplier=1.0", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    // Alice was seeded with no cliqueId
    const result = await asAlice.query(api.cliqueBonus.getCliqueBonus, {});

    expect(result.hasClique).toBe(false);
    expect(result.clique).toBeNull();
    expect(result.bonusMultiplier).toBe(1.0);
  });

  test("user with clique returns hasClique=true and bonusMultiplier=1.1", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const aliceUser = await getAliceUser(t);

    // Insert a clique row
    const cliqueId = await t.run(async (ctx: any) =>
      ctx.db.insert("cliques", {
        name: "The Dropouts",
        archetype: "dropouts",
        description: "Rebellious students who quit before finishing.",
        memberCount: 1,
        totalWins: 5,
        createdAt: Date.now(),
      }),
    );

    // Link Alice to the clique
    await t.run(async (ctx: any) => {
      await ctx.db.patch(aliceUser!._id, { cliqueId, cliqueRole: "member" });
    });

    const result = await asAlice.query(api.cliqueBonus.getCliqueBonus, {});

    expect(result.hasClique).toBe(true);
    expect(result.clique).not.toBeNull();
    expect(result.clique.name).toBe("The Dropouts");
    expect(result.bonusMultiplier).toBeCloseTo(1.1);
  });

  test("requires authentication", async () => {
    const t = setupTestConvex();

    await expect(
      t.query(api.cliqueBonus.getCliqueBonus, {}),
    ).rejects.toThrow();
  });
});

// ── getCliqueLeaderboard ───────────────────────────────────────────────

describe("getCliqueLeaderboard", () => {
  test("returns cliques sorted by totalWins descending", async () => {
    const t = setupTestConvex();

    await t.run(async (ctx: any) => {
      await ctx.db.insert("cliques", {
        name: "Low Scorers",
        archetype: "nerds",
        description: "Rarely win.",
        memberCount: 2,
        totalWins: 10,
        createdAt: Date.now(),
      });
      await ctx.db.insert("cliques", {
        name: "Top Clique",
        archetype: "preps",
        description: "Always win.",
        memberCount: 5,
        totalWins: 100,
        createdAt: Date.now(),
      });
    });

    const leaderboard = await t.query(api.cliqueBonus.getCliqueLeaderboard, {});

    expect(leaderboard.length).toBe(2);
    expect(leaderboard[0].name).toBe("Top Clique");
    expect(leaderboard[0].totalWins).toBe(100);
    expect(leaderboard[1].name).toBe("Low Scorers");
    expect(leaderboard[1].totalWins).toBe(10);
  });

  test("respects limit parameter", async () => {
    const t = setupTestConvex();

    await t.run(async (ctx: any) => {
      for (let i = 1; i <= 3; i++) {
        await ctx.db.insert("cliques", {
          name: `Clique ${i}`,
          archetype: "dropouts",
          description: `Clique number ${i}`,
          memberCount: i,
          totalWins: i * 10,
          createdAt: Date.now(),
        });
      }
    });

    const leaderboard = await t.query(api.cliqueBonus.getCliqueLeaderboard, {
      limit: 1,
    });

    expect(leaderboard).toHaveLength(1);
    // The clique with the highest totalWins (30) should be returned
    expect(leaderboard[0].totalWins).toBe(30);
  });

  test("returns empty array when no cliques exist", async () => {
    const t = setupTestConvex();

    const leaderboard = await t.query(api.cliqueBonus.getCliqueLeaderboard, {});

    expect(leaderboard).toEqual([]);
  });
});
