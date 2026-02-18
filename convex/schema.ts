import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema(
  {
    users: defineTable({
      privyId: v.string(),
      username: v.string(),
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      telegramUserId: v.optional(v.string()),
      avatarPath: v.optional(v.string()),
      // String ID referencing a userDecks doc in the cards component.
      // Stored as string because host schema can't reference component table types.
      activeDeckId: v.optional(v.string()),
      // Clique membership
      cliqueId: v.optional(v.id("cliques")),
      cliqueRole: v.optional(v.union(v.literal("member"), v.literal("leader"), v.literal("founder"))),
      createdAt: v.number(),
    })
      .index("by_privyId", ["privyId"])
      .index("by_username", ["username"])
      .index("by_clique", ["cliqueId"])
      .index("by_telegramUserId", ["telegramUserId"]),

    agents: defineTable({
      name: v.string(),
      apiKeyHash: v.string(),
      apiKeyPrefix: v.string(),
      userId: v.id("users"),
      isActive: v.boolean(),
      createdAt: v.number(),
    })
      .index("by_apiKeyHash", ["apiKeyHash"])
      .index("by_userId", ["userId"]),

    // Links match component matches to story context.
    // The match component schema is strict, so story metadata lives here.
    storyMatches: defineTable({
      matchId: v.string(),
      userId: v.string(),
      chapterId: v.string(),
      stageNumber: v.number(),
      stageId: v.string(),
      outcome: v.optional(
        v.union(v.literal("won"), v.literal("lost"), v.literal("abandoned")),
      ),
      starsEarned: v.optional(v.number()),
      rewardsGold: v.optional(v.number()),
      rewardsXp: v.optional(v.number()),
      firstClearBonus: v.optional(v.number()),
      completedAt: v.optional(v.number()),
    })
      .index("by_matchId", ["matchId"])
      .index("by_userId", ["userId"]),

    // Singleton — tracks current position in the 16-week campaign.
    // One row. Created by seed, advanced by cron.
    campaignState: defineTable({
      weekNumber: v.number(), // 1–16
      dayOfWeek: v.number(), // 1–5 (Mon–Fri school days)
      actNumber: v.number(), // 1–4
      isActive: v.boolean(),
      startedAt: v.number(),
      lastAdvancedAt: v.number(),
    }),

    // Tracks daily agent check-ins so we know who's seen today's briefing.
    agentCheckins: defineTable({
      agentId: v.id("agents"),
      userId: v.id("users"),
      weekNumber: v.number(),
      dayOfWeek: v.number(),
      checkedInAt: v.number(),
    })
      .index("by_agent_day", ["agentId", "weekNumber", "dayOfWeek"])
      .index("by_userId", ["userId"]),

    // Cliques - one per archetype
    cliques: defineTable({
      name: v.string(),           // e.g., "Honor Club"
      archetype: v.string(),      // dropouts, preps, geeks, freaks, nerds, goodies
      description: v.string(),
      iconUrl: v.optional(v.string()),
      memberCount: v.number(),
      totalWins: v.number(),
      createdAt: v.number(),
    })
      .index("by_archetype", ["archetype"]),

    telegramIdentities: defineTable({
      telegramUserId: v.string(),
      userId: v.id("users"),
      username: v.optional(v.string()),
      firstName: v.optional(v.string()),
      privateChatId: v.optional(v.string()),
      linkedAt: v.number(),
      lastSeenAt: v.number(),
    })
      .index("by_telegramUserId", ["telegramUserId"])
      .index("by_userId", ["userId"]),

    matchPlatformPresence: defineTable({
      matchId: v.string(),
      hostUserId: v.string(),
      awayUserId: v.optional(v.string()),
      hostPlatform: v.union(
        v.literal("web"),
        v.literal("telegram_inline"),
        v.literal("telegram_miniapp"),
        v.literal("agent"),
        v.literal("cpu"),
      ),
      awayPlatform: v.optional(
        v.union(
          v.literal("web"),
          v.literal("telegram_inline"),
          v.literal("telegram_miniapp"),
          v.literal("agent"),
          v.literal("cpu"),
        ),
      ),
      hostLastActiveAt: v.number(),
      awayLastActiveAt: v.optional(v.number()),
    })
      .index("by_matchId", ["matchId"])
      .index("by_hostUserId", ["hostUserId"])
      .index("by_awayUserId", ["awayUserId"]),

    telegramProcessedUpdates: defineTable({
      updateId: v.number(),
      processedAt: v.number(),
    }).index("by_updateId", ["updateId"]),

    telegramActionTokens: defineTable({
      token: v.string(),
      matchId: v.string(),
      seat: v.union(v.literal("host"), v.literal("away")),
      commandJson: v.string(),
      expectedVersion: v.optional(v.number()),
      expiresAt: v.number(),
      createdAt: v.number(),
    })
      .index("by_token", ["token"])
      .index("by_matchId", ["matchId"]),
  },
  { schemaValidation: false },
);
