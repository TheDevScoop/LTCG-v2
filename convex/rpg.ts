import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const MAX_LIMIT = 100;

function now(): number {
  return Date.now();
}

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return 20;
  return Math.max(1, Math.min(MAX_LIMIT, limit));
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function computeContentAddress(input: unknown): string {
  const serialized = JSON.stringify(input);
  let hash = 2166136261;
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function parseDiceExpression(expression: string): { diceCount: number; diceSides: number; modifier: number } {
  const match = expression.trim().toLowerCase().match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) throw new Error("Dice expression must match NdM(+/-K), e.g. 1d20+3");
  const diceCount = Number(match[1]);
  const diceSides = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;

  if (diceCount <= 0 || diceCount > 200) throw new Error("diceCount out of range");
  if (diceSides <= 1 || diceSides > 1000) throw new Error("diceSides out of range");

  return { diceCount, diceSides, modifier };
}

function createSeededRng(seedInput: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < seedInput.length; i++) {
    seed ^= seedInput.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSnapshotChecksum(state: unknown): string {
  return computeContentAddress(state);
}

export const createRuleset = mutation({
  args: {
    ownerId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    license: v.string(),
    compatibility: v.string(),
    validationSchema: v.any(),
    definition: v.any(),
  },
  handler: async (ctx, args) => {
    const createdAt = now();
    const rulesetId = await ctx.db.insert("rpgRulesets", {
      ownerId: args.ownerId,
      name: args.name,
      slug: args.slug ?? slugify(args.name),
      schemaVersion: "1.0.0",
      license: args.license,
      compatibility: args.compatibility,
      validationSchema: args.validationSchema,
      definition: args.definition,
      isPublished: false,
      createdAt,
      updatedAt: createdAt,
    });

    return { rulesetId };
  },
});

export const createWorld = mutation({
  args: {
    ownerId: v.string(),
    title: v.string(),
    slug: v.optional(v.string()),
    description: v.string(),
    genre: v.string(),
    tags: v.array(v.string()),
    visibility: v.optional(v.union(v.literal("private"), v.literal("unlisted"), v.literal("public"))),
    manifest: v.any(),
  },
  handler: async (ctx, args) => {
    const createdAt = now();
    const worldId = await ctx.db.insert("rpgWorlds", {
      ownerId: args.ownerId,
      title: args.title,
      slug: args.slug ?? slugify(args.title),
      description: args.description,
      genre: args.genre,
      tags: args.tags,
      visibility: args.visibility ?? "private",
      status: "draft",
      activeVersionId: undefined,
      popularityScore: 0,
      installCount: 0,
      ratingCount: 0,
      ratingAverage: 0,
      safetyState: "pending",
      schemaVersion: "1.0.0",
      createdAt,
      updatedAt: createdAt,
      publishedAt: undefined,
    });

    const contentAddress = computeContentAddress(args.manifest);
    const worldVersionId = await ctx.db.insert("rpgWorldVersions", {
      worldId,
      version: "1.0.0",
      schemaVersion: "1.0.0",
      contentAddress,
      manifest: args.manifest,
      dependencies: [],
      changelog: "Initial world draft",
      createdBy: args.ownerId,
      createdAt,
    });

    await ctx.db.patch(worldId, {
      activeVersionId: worldVersionId,
      updatedAt: now(),
    });

    return { worldId, worldVersionId, contentAddress };
  },
});

export const publishWorld = mutation({
  args: {
    worldId: v.id("rpgWorlds"),
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) throw new Error("World not found");
    if (world.ownerId !== args.ownerId) throw new Error("Not world owner");

    const publishedAt = now();
    await ctx.db.patch(args.worldId, {
      status: "published",
      visibility: "public",
      publishedAt,
      updatedAt: publishedAt,
      safetyState: world.safetyState === "flagged" ? "flagged" : "approved",
    });

    return { worldId: args.worldId, publishedAt };
  },
});

export const forkWorld = mutation({
  args: {
    sourceWorldId: v.id("rpgWorlds"),
    newOwnerId: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceWorldId);
    if (!source) throw new Error("Source world not found");

    const activeVersion = source.activeVersionId
      ? await ctx.db.get(source.activeVersionId)
      : null;
    if (!activeVersion) throw new Error("Source world has no active version");

    const createdAt = now();
    const worldId = await ctx.db.insert("rpgWorlds", {
      ownerId: args.newOwnerId,
      title: args.title ?? `${source.title} (Fork)`,
      slug: slugify(`${source.slug}-${args.newOwnerId.slice(0, 6)}`),
      description: source.description,
      genre: source.genre,
      tags: source.tags,
      visibility: "private",
      status: "draft",
      activeVersionId: undefined,
      popularityScore: 0,
      installCount: 0,
      ratingCount: 0,
      ratingAverage: 0,
      safetyState: "pending",
      schemaVersion: source.schemaVersion,
      createdAt,
      updatedAt: createdAt,
      publishedAt: undefined,
    });

    const worldVersionId = await ctx.db.insert("rpgWorldVersions", {
      worldId,
      version: "1.0.0-fork",
      schemaVersion: activeVersion.schemaVersion,
      contentAddress: activeVersion.contentAddress,
      manifest: activeVersion.manifest,
      dependencies: activeVersion.dependencies,
      changelog: `Forked from ${String(args.sourceWorldId)}`,
      createdBy: args.newOwnerId,
      createdAt,
    });

    await ctx.db.patch(worldId, { activeVersionId: worldVersionId, updatedAt: now() });

    return { worldId, worldVersionId };
  },
});

export const installWorld = mutation({
  args: {
    worldVersionId: v.id("rpgWorldVersions"),
    installerId: v.string(),
  },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.worldVersionId);
    if (!version) throw new Error("World version not found");

    const world = await ctx.db.get(version.worldId);
    if (!world) throw new Error("World not found");

    await ctx.db.patch(version.worldId, {
      installCount: (world.installCount ?? 0) + 1,
      popularityScore: (world.popularityScore ?? 0) + 1,
      updatedAt: now(),
    });

    return {
      worldId: version.worldId,
      worldVersionId: args.worldVersionId,
      installedBy: args.installerId,
      contentAddress: version.contentAddress,
      manifest: version.manifest,
    };
  },
});

export const listWorlds = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    return ctx.db
      .query("rpgWorlds")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .order("desc")
      .take(limit);
  },
});

export const searchWorlds = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const needle = args.query.trim().toLowerCase();
    const candidates = await ctx.db
      .query("rpgWorlds")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    return candidates
      .filter((world) => {
        const haystack = `${world.title} ${world.description} ${(world.tags ?? []).join(" ")} ${world.genre}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, clampLimit(args.limit));
  },
});

export const generateCampaign = mutation({
  args: {
    worldId: v.id("rpgWorlds"),
    ownerId: v.string(),
    title: v.string(),
    stages: v.number(),
  },
  handler: async (ctx, args) => {
    const stageCount = Math.max(3, Math.min(50, args.stages));
    const nodes = Array.from({ length: stageCount }, (_, idx) => ({
      id: `stage_${idx + 1}`,
      title: `Stage ${idx + 1}`,
      stageType: idx === stageCount - 1 ? "boss" : idx % 3 === 0 ? "social" : idx % 2 === 0 ? "combat" : "exploration",
      summary: `Auto-generated stage ${idx + 1} for ${args.title}`,
    }));

    const edges = nodes.slice(0, -1).map((node, idx) => ({
      from: node.id,
      to: nodes[idx + 1]!.id,
      condition: undefined,
    }));

    const graph = { schemaVersion: "1.0.0", nodes, edges };
    const createdAt = now();

    const campaignId = await ctx.db.insert("rpgCampaigns", {
      worldId: args.worldId,
      versionId: undefined,
      ownerId: args.ownerId,
      title: args.title,
      schemaVersion: "1.0.0",
      graph,
      validation: { valid: true, errors: [] as string[] },
      createdAt,
      updatedAt: createdAt,
    });

    return { campaignId, graph };
  },
});

export const validateCampaign = query({
  args: {
    campaignId: v.id("rpgCampaigns"),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");

    const graph = campaign.graph as { nodes?: Array<{ id: string }>; edges?: Array<{ from: string; to: string }> };
    const nodes = graph.nodes ?? [];
    const edges = graph.edges ?? [];
    const nodeSet = new Set(nodes.map((n) => n.id));
    const errors: string[] = [];

    if (nodes.length === 0) errors.push("Campaign has no nodes");
    for (const edge of edges) {
      if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) {
        errors.push(`Edge ${edge.from} -> ${edge.to} references unknown node`);
      }
    }

    return {
      campaignId: args.campaignId,
      valid: errors.length === 0,
      errors,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };
  },
});

export const createCharacter = mutation({
  args: {
    ownerId: v.string(),
    worldId: v.id("rpgWorlds"),
    name: v.string(),
    classId: v.optional(v.string()),
    stats: v.any(),
    inventory: v.any(),
    abilities: v.any(),
  },
  handler: async (ctx, args) => {
    const createdAt = now();
    const characterId = await ctx.db.insert("rpgCharacterSheets", {
      ownerId: args.ownerId,
      worldId: args.worldId,
      sessionId: undefined,
      name: args.name,
      classId: args.classId,
      level: 1,
      schemaVersion: "1.0.0",
      stats: args.stats,
      inventory: args.inventory,
      abilities: args.abilities,
      status: { hp: 100, condition: "healthy" },
      createdAt,
      updatedAt: createdAt,
    });

    return { characterId };
  },
});

export const levelCharacter = mutation({
  args: {
    characterId: v.id("rpgCharacterSheets"),
    levels: v.number(),
  },
  handler: async (ctx, args) => {
    const character = await ctx.db.get(args.characterId);
    if (!character) throw new Error("Character not found");

    const nextLevel = Math.max(1, Math.min(20, character.level + args.levels));
    await ctx.db.patch(args.characterId, { level: nextLevel, updatedAt: now() });

    return { characterId: args.characterId, level: nextLevel };
  },
});

export const exportCharacter = query({
  args: {
    characterId: v.id("rpgCharacterSheets"),
  },
  handler: async (ctx, args) => {
    const character = await ctx.db.get(args.characterId);
    if (!character) throw new Error("Character not found");
    return character;
  },
});

export const createSession = mutation({
  args: {
    ownerId: v.string(),
    worldVersionId: v.id("rpgWorldVersions"),
    title: v.string(),
    seatLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.worldVersionId);
    if (!version) throw new Error("World version not found");

    const createdAt = now();
    const runtimeState = {
      schemaVersion: "1.0.0",
      turn: 1,
      phase: "setup",
      seats: { dm: args.ownerId },
      flags: {},
      log: ["Session created"],
    };

    const sessionId = await ctx.db.insert("rpgSessions", {
      ownerId: args.ownerId,
      worldId: version.worldId,
      worldVersionId: args.worldVersionId,
      title: args.title,
      schemaVersion: "1.0.0",
      status: "waiting",
      seatLimit: Math.max(2, Math.min(7, args.seatLimit ?? 7)),
      runtimeState,
      startedAt: undefined,
      endedAt: undefined,
      createdAt,
      updatedAt: createdAt,
    });

    await ctx.db.insert("rpgSessionSnapshots", {
      sessionId,
      snapshotVersion: 0,
      state: runtimeState,
      checksum: buildSnapshotChecksum(runtimeState),
      createdAt,
    });

    return { sessionId, status: "waiting" };
  },
});

export const joinSession = mutation({
  args: {
    sessionId: v.id("rpgSessions"),
    actorId: v.string(),
    seat: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const runtimeState = { ...(session.runtimeState as any) };
    runtimeState.seats = { ...(runtimeState.seats ?? {}), [args.seat]: args.actorId };
    runtimeState.log = [...(runtimeState.log ?? []), `${args.actorId} joined ${args.seat}`];

    const seatCount = Object.keys(runtimeState.seats).length;
    const nextStatus = seatCount >= 2 ? "active" : session.status;

    await ctx.db.patch(args.sessionId, {
      runtimeState,
      status: nextStatus,
      startedAt: nextStatus === "active" ? session.startedAt ?? now() : session.startedAt,
      updatedAt: now(),
    });

    return {
      sessionId: args.sessionId,
      seat: args.seat,
      status: nextStatus,
    };
  },
});

export const getSessionState = query({
  args: {
    sessionId: v.id("rpgSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    return session;
  },
});

export const applySessionAction = mutation({
  args: {
    sessionId: v.id("rpgSessions"),
    actorId: v.string(),
    action: v.any(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status === "ended") throw new Error("Session already ended");

    const runtimeState = { ...(session.runtimeState as any) };
    runtimeState.log = [...(runtimeState.log ?? []), `${args.actorId}:${JSON.stringify(args.action)}`];
    runtimeState.lastActionAt = now();

    const latestEvent = await ctx.db
      .query("rpgSessionEvents")
      .withIndex("by_session_eventIndex", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .first();
    const eventIndex = (latestEvent?.eventIndex ?? -1) + 1;

    const createdAt = now();
    const eventId = await ctx.db.insert("rpgSessionEvents", {
      sessionId: args.sessionId,
      eventIndex,
      actorId: args.actorId,
      eventType: String((args.action as any)?.actionType ?? "action"),
      payload: args.action,
      createdAt,
    });

    await ctx.db.patch(args.sessionId, {
      runtimeState,
      status: session.status === "waiting" ? "active" : session.status,
      updatedAt: createdAt,
    });

    if (eventIndex % 5 === 0) {
      await ctx.db.insert("rpgSessionSnapshots", {
        sessionId: args.sessionId,
        snapshotVersion: eventIndex,
        state: runtimeState,
        checksum: buildSnapshotChecksum(runtimeState),
        createdAt,
      });
    }

    return { eventId, eventIndex, status: session.status === "waiting" ? "active" : session.status };
  },
});

export const endSession = mutation({
  args: {
    sessionId: v.id("rpgSessions"),
    actorId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    if (session.ownerId !== args.actorId) {
      throw new Error("Only session owner can end session");
    }

    const endedAt = now();
    await ctx.db.patch(args.sessionId, {
      status: "ended",
      endedAt,
      updatedAt: endedAt,
    });

    return { sessionId: args.sessionId, endedAt };
  },
});

export const rollDice = query({
  args: {
    expression: v.string(),
    seedHint: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const parsed = parseDiceExpression(args.expression);
    const rng = createSeededRng(`${args.seedHint ?? "default"}:${args.expression}`);
    const rolls = Array.from({ length: parsed.diceCount }, () => Math.floor(rng() * parsed.diceSides) + 1);
    const total = rolls.reduce((sum, value) => sum + value, 0) + parsed.modifier;
    return {
      expression: args.expression,
      roll: {
        dice: rolls,
        modifier: parsed.modifier,
        total,
      },
    };
  },
});

export const createMatchmakingListing = mutation({
  args: {
    ownerId: v.string(),
    worldId: v.id("rpgWorlds"),
    sessionId: v.optional(v.id("rpgSessions")),
    title: v.string(),
    partySize: v.number(),
    difficulty: v.string(),
    agentIntensity: v.number(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const createdAt = now();
    const listingId = await ctx.db.insert("rpgMatchmakingListings", {
      ownerId: args.ownerId,
      worldId: args.worldId,
      sessionId: args.sessionId,
      title: args.title,
      status: "open",
      partySize: Math.max(1, Math.min(7, args.partySize)),
      slotsFilled: 1,
      difficulty: args.difficulty,
      agentIntensity: Math.max(0, Math.min(100, args.agentIntensity)),
      tags: args.tags,
      createdAt,
      updatedAt: createdAt,
    });

    return { listingId };
  },
});

export const listMatchmakingListings = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return ctx.db
      .query("rpgMatchmakingListings")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(clampLimit(args.limit));
  },
});

export const joinMatchmakingListing = mutation({
  args: {
    listingId: v.id("rpgMatchmakingListings"),
    actorId: v.string(),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new Error("Listing not found");
    if (listing.status !== "open") throw new Error("Listing is not open");

    const nextSlots = listing.slotsFilled + 1;
    const nextStatus = nextSlots >= listing.partySize ? "closed" : "open";

    await ctx.db.patch(args.listingId, {
      slotsFilled: nextSlots,
      status: nextStatus,
      updatedAt: now(),
    });

    return { listingId: args.listingId, actorId: args.actorId, status: nextStatus, slotsFilled: nextSlots };
  },
});

export const createMarketplaceItem = mutation({
  args: {
    ownerId: v.string(),
    worldId: v.optional(v.id("rpgWorlds")),
    worldVersionId: v.optional(v.id("rpgWorldVersions")),
    itemType: v.union(v.literal("world"), v.literal("asset"), v.literal("ruleset"), v.literal("tool")),
    title: v.string(),
    description: v.string(),
    priceUsdCents: v.number(),
  },
  handler: async (ctx, args) => {
    const createdAt = now();
    const marketplaceItemId = await ctx.db.insert("rpgMarketplaceItems", {
      ownerId: args.ownerId,
      worldId: args.worldId,
      worldVersionId: args.worldVersionId,
      itemType: args.itemType,
      title: args.title,
      description: args.description,
      priceUsdCents: Math.max(0, Math.floor(args.priceUsdCents)),
      currency: "USD",
      status: "active",
      createdAt,
      updatedAt: createdAt,
    });

    return { marketplaceItemId };
  },
});

export const listMarketplaceItems = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return ctx.db
      .query("rpgMarketplaceItems")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(clampLimit(args.limit));
  },
});

export const buyMarketplaceItem = mutation({
  args: {
    marketplaceItemId: v.id("rpgMarketplaceItems"),
    buyerId: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.marketplaceItemId);
    if (!item) throw new Error("Marketplace item not found");
    if (item.status !== "active") throw new Error("Marketplace item is not active");

    const gross = item.priceUsdCents;
    const platformFee = Math.floor(gross * 0.15);
    const net = gross - platformFee;

    const payoutId = await ctx.db.insert("rpgCreatorPayouts", {
      creatorId: item.ownerId,
      marketplaceItemId: args.marketplaceItemId,
      purchaseUserId: args.buyerId,
      grossUsdCents: gross,
      platformFeeUsdCents: platformFee,
      netUsdCents: net,
      status: "pending",
      txRef: undefined,
      createdAt: now(),
      paidAt: undefined,
    });

    return {
      purchaseId: payoutId,
      marketplaceItemId: args.marketplaceItemId,
      grossUsdCents: gross,
      platformFeeUsdCents: platformFee,
      netUsdCents: net,
    };
  },
});

export const rateWorld = mutation({
  args: {
    worldId: v.id("rpgWorlds"),
    sessionId: v.optional(v.id("rpgSessions")),
    userId: v.string(),
    rating: v.number(),
    review: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clampedRating = Math.max(1, Math.min(5, Math.round(args.rating)));

    await ctx.db.insert("rpgRatings", {
      worldId: args.worldId,
      sessionId: args.sessionId,
      userId: args.userId,
      rating: clampedRating,
      review: args.review,
      createdAt: now(),
    });

    const allRatings = await ctx.db
      .query("rpgRatings")
      .withIndex("by_worldId", (q) => q.eq("worldId", args.worldId))
      .collect();

    const ratingCount = allRatings.length;
    const ratingAverage =
      ratingCount > 0 ? allRatings.reduce((sum, item) => sum + item.rating, 0) / ratingCount : 0;

    const world = await ctx.db.get(args.worldId);
    if (world) {
      await ctx.db.patch(args.worldId, {
        ratingCount,
        ratingAverage,
        popularityScore: world.popularityScore + clampedRating,
        updatedAt: now(),
      });
    }

    return { worldId: args.worldId, ratingCount, ratingAverage };
  },
});

export const reportModeration = mutation({
  args: {
    targetType: v.union(v.literal("world"), v.literal("session"), v.literal("agent"), v.literal("listing")),
    targetId: v.string(),
    reporterId: v.optional(v.string()),
    reason: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const createdAt = now();
    const moderationId = await ctx.db.insert("rpgModerationQueues", {
      targetType: args.targetType,
      targetId: args.targetId,
      reporterId: args.reporterId,
      reason: args.reason,
      details: args.details,
      status: "open",
      safetyState: "pending",
      reviewerId: undefined,
      resolution: undefined,
      createdAt,
      updatedAt: createdAt,
    });

    return { moderationId };
  },
});

export const reviewModeration = mutation({
  args: {
    moderationId: v.id("rpgModerationQueues"),
    reviewerId: v.string(),
    status: v.union(v.literal("in_review"), v.literal("resolved"), v.literal("dismissed")),
    safetyState: v.union(v.literal("pending"), v.literal("approved"), v.literal("flagged")),
    resolution: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const moderation = await ctx.db.get(args.moderationId);
    if (!moderation) throw new Error("Moderation queue item not found");

    await ctx.db.patch(args.moderationId, {
      status: args.status,
      safetyState: args.safetyState,
      reviewerId: args.reviewerId,
      resolution: args.resolution,
      updatedAt: now(),
    });

    return {
      moderationId: args.moderationId,
      status: args.status,
      safetyState: args.safetyState,
    };
  },
});

const FLAGSHIP_WORLDS: Array<{
  slug: string;
  title: string;
  genre: string;
  description: string;
  tags: string[];
  manifest: Record<string, unknown>;
}> = [
  {
    slug: "glass-circuit",
    title: "Glass Circuit",
    genre: "neon-noir",
    description: "Cyber-noir investigation campaign with faction warfare and surveillance pressure.",
    tags: ["cyberpunk", "investigation", "factions", "social", "tactical"],
    manifest: {
      schemaVersion: "1.0.0",
      worldId: "world_glass_circuit",
      title: "Glass Circuit",
      campaignLength: 12,
      artifactBundlePath: "packages/rpg-worlds/worlds/glass-circuit",
    },
  },
  {
    slug: "ashen-oath",
    title: "Ashen Oath",
    genre: "dark-fantasy",
    description: "Cursed-kingdom campaign of oath contracts, corruption, and ritual boss phases.",
    tags: ["dark-fantasy", "oaths", "ritual", "boss-rush"],
    manifest: {
      schemaVersion: "1.0.0",
      worldId: "world_ashen_oath",
      title: "Ashen Oath",
      campaignLength: 18,
      artifactBundlePath: "packages/rpg-worlds/worlds/ashen-oath",
    },
  },
  {
    slug: "starfall-frontier",
    title: "Starfall Frontier",
    genre: "cosmic-western",
    description: "Frontier campaign of relic train-heists, posse bonds, and duel windows.",
    tags: ["western", "cosmic", "heist", "episodic", "vehicles"],
    manifest: {
      schemaVersion: "1.0.0",
      worldId: "world_starfall_frontier",
      title: "Starfall Frontier",
      campaignLength: 12,
      artifactBundlePath: "packages/rpg-worlds/worlds/starfall-frontier",
    },
  },
];

export const bootstrapFlagshipWorlds = mutation({
  args: {
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    const created: Array<{ slug: string; worldId: string; worldVersionId: string }> = [];
    const existing: Array<{ slug: string; worldId: string; worldVersionId: string }> = [];

    for (const world of FLAGSHIP_WORLDS) {
      const found = await ctx.db
        .query("rpgWorlds")
        .withIndex("by_slug", (q) => q.eq("slug", world.slug))
        .first();

      if (found && found.activeVersionId) {
        existing.push({
          slug: world.slug,
          worldId: String(found._id),
          worldVersionId: String(found.activeVersionId),
        });
        continue;
      }

      const createdAt = now();
      const worldId = await ctx.db.insert("rpgWorlds", {
        ownerId: args.ownerId,
        title: world.title,
        slug: world.slug,
        description: world.description,
        genre: world.genre,
        tags: world.tags,
        visibility: "public",
        status: "published",
        activeVersionId: undefined,
        popularityScore: 1,
        installCount: 0,
        ratingCount: 0,
        ratingAverage: 0,
        safetyState: "approved",
        schemaVersion: "1.0.0",
        createdAt,
        updatedAt: createdAt,
        publishedAt: createdAt,
      });

      const worldVersionId = await ctx.db.insert("rpgWorldVersions", {
        worldId,
        version: "1.0.0",
        schemaVersion: "1.0.0",
        contentAddress: computeContentAddress(world.manifest),
        manifest: world.manifest,
        dependencies: [],
        changelog: "Flagship world bootstrap",
        createdBy: args.ownerId,
        createdAt,
      });

      await ctx.db.insert("rpgScenes", {
        worldId,
        versionId: worldVersionId,
        name: `${world.title} Core Scene`,
        schemaVersion: "1.0.0",
        mode: "hybrid",
        nodes: {
          sceneId: `${world.slug}_core`,
          tilesetRef: `${world.slug}/scenes-2d.json`,
          meshRef: `${world.slug}/scenes-3d.json`,
        },
        lighting: { profile: "default" },
        triggers: [],
        nav: {},
        createdAt,
        updatedAt: createdAt,
      });

      await ctx.db.insert("rpgDungeons", {
        worldId,
        versionId: worldVersionId,
        name: `${world.title} Dungeon Seed`,
        schemaVersion: "1.0.0",
        topology: {
          seedRef: `${world.slug}/dungeons.json`,
          style: world.genre,
        },
        encounters: [],
        seed: `${world.slug}-seed`,
        createdAt,
        updatedAt: createdAt,
      });

      await ctx.db.insert("rpgCampaigns", {
        worldId,
        versionId: worldVersionId,
        ownerId: args.ownerId,
        title: `${world.title} Campaign`,
        schemaVersion: "1.0.0",
        graph: {
          nodes: [
            { id: "stage_1", title: "Opening", stageType: "exploration", summary: "Campaign opening stage" },
            { id: "stage_2", title: "Climax", stageType: "boss", summary: "Campaign climax stage" },
          ],
          edges: [{ from: "stage_1", to: "stage_2" }],
        },
        validation: { valid: true, errors: [] },
        createdAt,
        updatedAt: createdAt,
      });

      await ctx.db.insert("rpgSessionTemplates", {
        ownerId: args.ownerId,
        worldId,
        name: `${world.title} Default Template`,
        schemaVersion: "1.0.0",
        config: {
          seatLimit: 7,
          defaultMode: "hybrid",
        },
        agentPolicy: {
          dm: "full",
          players: "full",
          narrator: "full",
          npc_controller: "full",
        },
        createdAt,
        updatedAt: createdAt,
      });

      await ctx.db.patch(worldId, {
        activeVersionId: worldVersionId,
        updatedAt: now(),
      });

      created.push({
        slug: world.slug,
        worldId: String(worldId),
        worldVersionId: String(worldVersionId),
      });
    }

    return {
      created,
      existing,
      total: created.length + existing.length,
    };
  },
});

export const getWorldBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db
      .query("rpgWorlds")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!world) return null;

    const activeVersion = world.activeVersionId ? await ctx.db.get(world.activeVersionId) : null;
    return {
      world,
      activeVersion,
    };
  },
});

export const getWorldDetail = query({
  args: {
    worldId: v.id("rpgWorlds"),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) throw new Error("World not found");

    const activeVersion = world.activeVersionId ? await ctx.db.get(world.activeVersionId) : null;
    const scenes = await ctx.db
      .query("rpgScenes")
      .withIndex("by_worldId", (q) => q.eq("worldId", args.worldId))
      .collect();
    const dungeons = await ctx.db
      .query("rpgDungeons")
      .withIndex("by_worldId", (q) => q.eq("worldId", args.worldId))
      .collect();
    const campaigns = await ctx.db
      .query("rpgCampaigns")
      .withIndex("by_worldId", (q) => q.eq("worldId", args.worldId))
      .collect();

    return {
      world,
      activeVersion,
      scenes,
      dungeons,
      campaigns,
    };
  },
});

export const listFeaturedWorlds = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    return ctx.db
      .query("rpgWorlds")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .order("desc")
      .take(limit);
  },
});
