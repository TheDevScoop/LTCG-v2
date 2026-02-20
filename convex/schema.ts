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

    // PvP lobby metadata (host-layer only). Match state still lives in the
    // match component; this table adds visibility + join-code routing.
    pvpLobbies: defineTable({
      matchId: v.string(),
      mode: v.literal("pvp"),
      hostUserId: v.string(),
      hostUsername: v.string(),
      visibility: v.union(v.literal("public"), v.literal("private")),
      joinCode: v.optional(v.string()),
      status: v.union(
        v.literal("waiting"),
        v.literal("active"),
        v.literal("ended"),
        v.literal("canceled"),
      ),
      createdAt: v.number(),
      activatedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      pongEnabled: v.optional(v.boolean()),
      redemptionEnabled: v.optional(v.boolean()),
    })
      .index("by_matchId", ["matchId"])
      .index("by_hostUserId", ["hostUserId"])
      .index("by_joinCode", ["joinCode"])
      .index("by_status", ["status"]),

    // Dedupe/lock rows for scheduled AI turns.
    aiTurnQueue: defineTable({
      matchId: v.string(),
      createdAt: v.number(),
    }).index("by_matchId", ["matchId"]),

    // Presence + platform markers for active matches.
    // Used to show whether players are on web/telegram/discord/etc.
    matchPresence: defineTable({
      matchId: v.string(),
      userId: v.string(),
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
      lastSeenAt: v.number(),
      createdAt: v.number(),
    })
      .index("by_match", ["matchId"])
      .index("by_user", ["userId"])
      .index("by_match_user", ["matchId", "userId"]),

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

    rpgRulesets: defineTable({
      ownerId: v.string(),
      name: v.string(),
      slug: v.string(),
      schemaVersion: v.string(),
      license: v.string(),
      compatibility: v.string(),
      validationSchema: v.any(),
      definition: v.any(),
      isPublished: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_ownerId", ["ownerId"])
      .index("by_slug", ["slug"])
      .index("by_isPublished", ["isPublished"]),

    rpgDiceProfiles: defineTable({
      ownerId: v.string(),
      name: v.string(),
      schemaVersion: v.string(),
      profile: v.any(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_ownerId", ["ownerId"]),

    rpgCharacterClasses: defineTable({
      ownerId: v.string(),
      worldId: v.optional(v.id("rpgWorlds")),
      rulesetId: v.optional(v.id("rpgRulesets")),
      name: v.string(),
      schemaVersion: v.string(),
      progression: v.any(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_ownerId", ["ownerId"])
      .index("by_worldId", ["worldId"])
      .index("by_rulesetId", ["rulesetId"]),

    rpgCharacterSheets: defineTable({
      ownerId: v.string(),
      worldId: v.id("rpgWorlds"),
      sessionId: v.optional(v.id("rpgSessions")),
      name: v.string(),
      classId: v.optional(v.string()),
      level: v.number(),
      schemaVersion: v.string(),
      stats: v.any(),
      inventory: v.any(),
      abilities: v.any(),
      status: v.any(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_ownerId", ["ownerId"])
      .index("by_worldId", ["worldId"])
      .index("by_sessionId", ["sessionId"]),

    rpgWorlds: defineTable({
      ownerId: v.string(),
      title: v.string(),
      slug: v.string(),
      description: v.string(),
      genre: v.string(),
      tags: v.array(v.string()),
      visibility: v.union(v.literal("private"), v.literal("unlisted"), v.literal("public")),
      status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
      activeVersionId: v.optional(v.id("rpgWorldVersions")),
      popularityScore: v.number(),
      installCount: v.number(),
      ratingCount: v.number(),
      ratingAverage: v.number(),
      safetyState: v.union(v.literal("pending"), v.literal("approved"), v.literal("flagged")),
      schemaVersion: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
      publishedAt: v.optional(v.number()),
    })
      .index("by_ownerId", ["ownerId"])
      .index("by_slug", ["slug"])
      .index("by_status", ["status"])
      .index("by_createdAt", ["createdAt"])
      .index("by_popularityScore", ["popularityScore"])
      .index("by_safetyState", ["safetyState"]),

    rpgWorldVersions: defineTable({
      worldId: v.id("rpgWorlds"),
      version: v.string(),
      schemaVersion: v.string(),
      contentAddress: v.string(),
      manifest: v.any(),
      dependencies: v.array(v.string()),
      changelog: v.optional(v.string()),
      createdBy: v.string(),
      createdAt: v.number(),
    })
      .index("by_worldId", ["worldId"])
      .index("by_contentAddress", ["contentAddress"])
      .index("by_createdAt", ["createdAt"]),

    rpgScenes: defineTable({
      worldId: v.id("rpgWorlds"),
      versionId: v.optional(v.id("rpgWorldVersions")),
      name: v.string(),
      schemaVersion: v.string(),
      mode: v.union(v.literal("2d"), v.literal("3d"), v.literal("hybrid")),
      nodes: v.any(),
      lighting: v.any(),
      triggers: v.any(),
      nav: v.any(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_worldId", ["worldId"])
      .index("by_versionId", ["versionId"])
      .index("by_mode", ["mode"]),

    rpgDungeons: defineTable({
      worldId: v.id("rpgWorlds"),
      versionId: v.optional(v.id("rpgWorldVersions")),
      name: v.string(),
      schemaVersion: v.string(),
      topology: v.any(),
      encounters: v.any(),
      seed: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_worldId", ["worldId"])
      .index("by_versionId", ["versionId"]),

    rpgCampaigns: defineTable({
      worldId: v.id("rpgWorlds"),
      versionId: v.optional(v.id("rpgWorldVersions")),
      ownerId: v.string(),
      title: v.string(),
      schemaVersion: v.string(),
      graph: v.any(),
      validation: v.any(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_worldId", ["worldId"])
      .index("by_ownerId", ["ownerId"])
      .index("by_createdAt", ["createdAt"]),

    rpgSessionTemplates: defineTable({
      ownerId: v.string(),
      worldId: v.id("rpgWorlds"),
      name: v.string(),
      schemaVersion: v.string(),
      config: v.any(),
      agentPolicy: v.any(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_ownerId", ["ownerId"])
      .index("by_worldId", ["worldId"]),

    rpgSessions: defineTable({
      ownerId: v.string(),
      worldId: v.id("rpgWorlds"),
      worldVersionId: v.id("rpgWorldVersions"),
      title: v.string(),
      schemaVersion: v.string(),
      status: v.union(v.literal("waiting"), v.literal("active"), v.literal("paused"), v.literal("ended")),
      seatLimit: v.number(),
      runtimeState: v.any(),
      startedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_ownerId", ["ownerId"])
      .index("by_worldId", ["worldId"])
      .index("by_status", ["status"])
      .index("by_createdAt", ["createdAt"]),

    rpgSessionEvents: defineTable({
      sessionId: v.id("rpgSessions"),
      eventIndex: v.number(),
      actorId: v.string(),
      eventType: v.string(),
      payload: v.any(),
      createdAt: v.number(),
    })
      .index("by_sessionId", ["sessionId"])
      .index("by_session_eventIndex", ["sessionId", "eventIndex"])
      .index("by_createdAt", ["createdAt"]),

    rpgSessionSnapshots: defineTable({
      sessionId: v.id("rpgSessions"),
      snapshotVersion: v.number(),
      state: v.any(),
      checksum: v.string(),
      createdAt: v.number(),
    })
      .index("by_sessionId", ["sessionId"])
      .index("by_session_snapshotVersion", ["sessionId", "snapshotVersion"])
      .index("by_createdAt", ["createdAt"]),

    rpgAgentActors: defineTable({
      sessionId: v.id("rpgSessions"),
      seat: v.string(),
      role: v.union(v.literal("dm"), v.literal("player"), v.literal("narrator"), v.literal("npc_controller")),
      agentId: v.optional(v.id("agents")),
      externalAgentRef: v.optional(v.string()),
      policy: v.any(),
      status: v.union(v.literal("connected"), v.literal("paused"), v.literal("disconnected")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_sessionId", ["sessionId"])
      .index("by_session_seat", ["sessionId", "seat"])
      .index("by_role", ["role"])
      .index("by_status", ["status"]),

    rpgMatchmakingListings: defineTable({
      ownerId: v.string(),
      worldId: v.id("rpgWorlds"),
      sessionId: v.optional(v.id("rpgSessions")),
      title: v.string(),
      status: v.union(v.literal("open"), v.literal("closed"), v.literal("archived")),
      partySize: v.number(),
      slotsFilled: v.number(),
      difficulty: v.string(),
      agentIntensity: v.number(),
      tags: v.array(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_worldId", ["worldId"])
      .index("by_ownerId", ["ownerId"])
      .index("by_createdAt", ["createdAt"]),

    rpgMarketplaceItems: defineTable({
      ownerId: v.string(),
      worldId: v.optional(v.id("rpgWorlds")),
      worldVersionId: v.optional(v.id("rpgWorldVersions")),
      itemType: v.union(v.literal("world"), v.literal("asset"), v.literal("ruleset"), v.literal("tool")),
      title: v.string(),
      description: v.string(),
      priceUsdCents: v.number(),
      currency: v.string(),
      status: v.union(v.literal("active"), v.literal("inactive"), v.literal("sold_out")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_ownerId", ["ownerId"])
      .index("by_worldId", ["worldId"])
      .index("by_createdAt", ["createdAt"]),

    rpgRatings: defineTable({
      worldId: v.id("rpgWorlds"),
      sessionId: v.optional(v.id("rpgSessions")),
      userId: v.string(),
      rating: v.number(),
      review: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_worldId", ["worldId"])
      .index("by_world_user", ["worldId", "userId"])
      .index("by_sessionId", ["sessionId"])
      .index("by_createdAt", ["createdAt"]),

    rpgModerationQueues: defineTable({
      targetType: v.union(v.literal("world"), v.literal("session"), v.literal("agent"), v.literal("listing")),
      targetId: v.string(),
      reporterId: v.optional(v.string()),
      reason: v.string(),
      details: v.optional(v.string()),
      status: v.union(v.literal("open"), v.literal("in_review"), v.literal("resolved"), v.literal("dismissed")),
      safetyState: v.union(v.literal("pending"), v.literal("approved"), v.literal("flagged")),
      reviewerId: v.optional(v.string()),
      resolution: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_targetType", ["targetType"])
      .index("by_targetId", ["targetId"])
      .index("by_safetyState", ["safetyState"])
      .index("by_createdAt", ["createdAt"]),

    rpgCreatorPayouts: defineTable({
      creatorId: v.string(),
      marketplaceItemId: v.id("rpgMarketplaceItems"),
      purchaseUserId: v.string(),
      grossUsdCents: v.number(),
      platformFeeUsdCents: v.number(),
      netUsdCents: v.number(),
      status: v.union(v.literal("pending"), v.literal("queued"), v.literal("paid"), v.literal("failed")),
      txRef: v.optional(v.string()),
      createdAt: v.number(),
      paidAt: v.optional(v.number()),
    })
      .index("by_creatorId", ["creatorId"])
      .index("by_status", ["status"])
      .index("by_marketplaceItemId", ["marketplaceItemId"])
      .index("by_createdAt", ["createdAt"]),

    studioRuns: defineTable({
      runId: v.string(),
      projectName: v.string(),
      status: v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("canceled"),
      ),
      totalJobs: v.number(),
      completedJobs: v.number(),
      failedJobs: v.number(),
      canceledJobs: v.number(),
      batchSize: v.number(),
      stopOnBudget: v.boolean(),
      budgetUsd: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_run_id", ["runId"])
      .index("by_status_updated", ["status", "updatedAt"]),

    studioRunJobs: defineTable({
      runId: v.string(),
      jobId: v.string(),
      state: v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("succeeded"),
        v.literal("failed"),
        v.literal("canceled"),
      ),
      attempt: v.number(),
      maxAttempts: v.number(),
      input: v.any(),
      output: v.optional(v.any()),
      error: v.optional(v.any()),
      claimToken: v.optional(v.string()),
      claimedAt: v.optional(v.number()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
    })
      .index("by_run", ["runId"])
      .index("by_run_job", ["runId", "jobId"])
      .index("by_run_state", ["runId", "state"])
      .index("by_claim_token", ["claimToken"]),

    // Telegram identity linking (maps Telegram users to LTCG users)
    telegramIdentities: defineTable({
      userId: v.string(),
      telegramUserId: v.string(),
      username: v.optional(v.string()),
      firstName: v.optional(v.string()),
      privateChatId: v.optional(v.string()),
      lastSeenAt: v.number(),
      linkedAt: v.number(),
    })
      .index("by_userId", ["userId"])
      .index("by_telegramUserId", ["telegramUserId"]),

    // One-time action tokens for Telegram inline buttons
    telegramActionTokens: defineTable({
      token: v.string(),
      matchId: v.string(),
      seat: v.union(v.literal("host"), v.literal("away")),
      commandJson: v.string(),
      expectedVersion: v.optional(v.number()),
      expiresAt: v.number(),
      createdAt: v.number(),
    }).index("by_token", ["token"]),

    // Idempotency guard for Telegram webhook updates
    telegramProcessedUpdates: defineTable({
      updateId: v.number(),
      processedAt: v.number(),
    }).index("by_updateId", ["updateId"]),

    studioPromotions: defineTable({
      promotionId: v.string(),
      runId: v.optional(v.string()),
      tokenHash: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("validated"),
        v.literal("rejected"),
        v.literal("staged"),
        v.literal("failed"),
      ),
      report: v.any(),
      stagedCardIds: v.optional(v.array(v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_promotion_id", ["promotionId"])
      .index("by_run_id", ["runId"]),
  },
  { schemaValidation: false },
);
