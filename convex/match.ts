import { LTCGMatch } from "@lunchtable/match";
import { LTCGCards } from "@lunchtable/cards";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";
import { buildCardLookup, createInitialState, DEFAULT_CONFIG } from "@lunchtable/engine";
import { buildDeckFingerprint, buildMatchSeed, makeRng } from "./agentSeed";

const match: any = new LTCGMatch(components.lunchtable_tcg_match as any);
const cards: any = new LTCGCards(components.lunchtable_tcg_cards as any);

const seatValidator = v.union(v.literal("host"), v.literal("away"));

function resolveSeatForUser(meta: any, userId: string): "host" | "away" | null {
  if (!meta || !userId) return null;
  if (meta.hostId === userId) return "host";
  if (meta.awayId === userId) return "away";
  return null;
}

async function requireParticipant(ctx: any, matchId: string, userId: string) {
  const meta = await match.getMatchMeta(ctx, { matchId });
  if (!meta) {
    throw new Error("Match not found");
  }

  const seat = resolveSeatForUser(meta, userId);
  if (!seat) {
    throw new Error("You are not a participant in this match");
  }

  return { meta, seat };
}

// ---------------------------------------------------------------------------
// Match lifecycle
// ---------------------------------------------------------------------------

export const createMatch = mutation({
  args: {
    mode: v.union(v.literal("pvp"), v.literal("story")),
    hostDeck: v.array(v.string()),
    awayDeck: v.optional(v.array(v.string())),
    isAIOpponent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const isAIOpponent = args.isAIOpponent ?? false;

    return match.createMatch(ctx, {
      hostId: user._id,
      awayId: isAIOpponent ? "cpu" : undefined,
      mode: args.mode,
      hostDeck: args.hostDeck,
      awayDeck: isAIOpponent ? args.awayDeck ?? [] : undefined,
      isAIOpponent,
    });
  },
});

export const joinMatch = mutation({
  args: {
    matchId: v.string(),
    awayDeck: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return match.joinMatch(ctx, {
      matchId: args.matchId,
      awayId: user._id,
      awayDeck: args.awayDeck,
    });
  },
});

export const startMatch = mutation({
  args: {
    matchId: v.string(),
    // Deprecated: ignored. The server always constructs authoritative initial state.
    initialState: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { seat, meta } = await requireParticipant(ctx, args.matchId, user._id);
    if (seat !== "host") {
      throw new Error("Only the host can start the match");
    }

    if (!meta.awayId) {
      throw new Error("Cannot start match until away seat is filled");
    }
    const hostDeck = Array.isArray(meta.hostDeck) ? meta.hostDeck : [];
    const awayDeck = Array.isArray(meta.awayDeck) ? meta.awayDeck : [];
    if (hostDeck.length === 0 || awayDeck.length === 0) {
      throw new Error("Both host and away decks must be present before starting the match");
    }

    const allCards = await cards.cards.getAllCards(ctx);
    const cardLookup = buildCardLookup(Array.isArray(allCards) ? allCards : []);
    const seed = buildMatchSeed([
      "match.startMatch",
      `mode:${String(meta.mode ?? "unknown")}`,
      meta.hostId,
      meta.awayId,
      `hostDeck:${buildDeckFingerprint(hostDeck)}`,
      `awayDeck:${buildDeckFingerprint(awayDeck)}`,
    ]);
    const firstPlayer: "host" | "away" = seed % 2 === 0 ? "host" : "away";
    const initialState = createInitialState(
      cardLookup,
      DEFAULT_CONFIG,
      meta.hostId,
      meta.awayId,
      hostDeck,
      awayDeck,
      firstPlayer,
      makeRng(seed),
    );

    return match.startMatch(ctx, {
      matchId: args.matchId,
      initialState: JSON.stringify(initialState),
    });
  },
});

export const submitAction = mutation({
  args: {
    matchId: v.string(),
    command: v.string(),
    seat: seatValidator,
    expectedVersion: v.number(),
    cardLookup: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { seat } = await requireParticipant(ctx, args.matchId, user._id);
    if (seat !== args.seat) {
      throw new Error("You can only submit actions for your own seat");
    }

    return match.submitAction(ctx, {
      matchId: args.matchId,
      command: args.command,
      seat: args.seat,
      expectedVersion: args.expectedVersion,
      cardLookup: args.cardLookup,
    });
  },
});

// ---------------------------------------------------------------------------
// Match queries
// ---------------------------------------------------------------------------

export const getMatchMeta = query({
  args: { matchId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireParticipant(ctx, args.matchId, user._id);
    return match.getMatchMeta(ctx, { matchId: args.matchId });
  },
});

export const getPlayerView = query({
  args: {
    matchId: v.string(),
    seat: seatValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { seat } = await requireParticipant(ctx, args.matchId, user._id);
    if (seat !== args.seat) {
      throw new Error("You can only view your own seat");
    }

    return match.getPlayerView(ctx, {
      matchId: args.matchId,
      seat: args.seat,
    });
  },
});

export const getRecentEvents = query({
  args: {
    matchId: v.string(),
    sinceVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireParticipant(ctx, args.matchId, user._id);
    return match.getRecentEvents(ctx, {
      matchId: args.matchId,
      sinceVersion: args.sinceVersion,
    });
  },
});

export const getLatestSnapshotVersion = query({
  args: { matchId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireParticipant(ctx, args.matchId, user._id);
    return match.getLatestSnapshotVersion(ctx, { matchId: args.matchId });
  },
});

export const getOpenPrompt = query({
  args: {
    matchId: v.string(),
    seat: seatValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { seat } = await requireParticipant(ctx, args.matchId, user._id);
    if (seat !== args.seat) {
      throw new Error("You can only query prompts for your own seat");
    }

    return match.getOpenPrompt(ctx, {
      matchId: args.matchId,
      seat: args.seat,
    });
  },
});

export const getActiveMatchByHost = query({
  args: { hostId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return match.getActiveMatchByHost(ctx, { hostId: args.hostId });
  },
});

export const getOpenLobbyByHost = query({
  args: { hostId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return match.getOpenLobbyByHost(ctx, { hostId: args.hostId });
  },
});

export const getMyActiveMatch = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return match.getActiveMatchByHost(ctx, { hostId: user._id });
  },
});

export const getMyOpenLobby = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return match.getOpenLobbyByHost(ctx, { hostId: user._id });
  },
});
