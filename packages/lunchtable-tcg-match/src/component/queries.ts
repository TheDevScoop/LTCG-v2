import { v } from "convex/values";
import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { legalMoves as computeLegalMoves, mask } from "@lunchtable/engine";
import type { GameState, Seat } from "@lunchtable/engine";
import { ensureInstanceMapping } from "./stateCompatibility";

const vSeat = v.union(v.literal("host"), v.literal("away"));

const vMatch = v.object({
  _id: v.id("matches"),
  _creationTime: v.number(),
  hostId: v.string(),
  awayId: v.union(v.string(), v.null()),
  mode: v.union(v.literal("pvp"), v.literal("story")),
  status: v.union(v.literal("waiting"), v.literal("active"), v.literal("ended")),
  winner: v.optional(v.union(v.literal("host"), v.literal("away"))),
  endReason: v.optional(v.string()),
  hostDeck: v.array(v.string()),
  awayDeck: v.union(v.array(v.string()), v.null()),
  isAIOpponent: v.boolean(),
  createdAt: v.number(),
  startedAt: v.optional(v.number()),
  endedAt: v.optional(v.number()),
});

const vMatchEventBatch = v.object({
  version: v.number(),
  events: v.string(),
  command: v.string(),
  seat: vSeat,
  createdAt: v.number(),
});

const vOpenPrompt = v.object({
  _id: v.id("matchPrompts"),
  _creationTime: v.number(),
  matchId: v.id("matches"),
  seat: vSeat,
  promptType: v.union(
    v.literal("chain_response"),
    v.literal("optional_trigger"),
    v.literal("replay_decision"),
    v.literal("discard"),
  ),
  data: v.optional(v.string()),
  resolved: v.boolean(),
  createdAt: v.number(),
  resolvedAt: v.optional(v.number()),
});

export function applySinceVersionIndex(q: any, matchId: any, sinceVersion: number) {
  return q.eq("matchId", matchId).gt("version", sinceVersion);
}

export function mapRecentEventsRows(
  rows: Array<{
    version: number;
    events: string;
    command: string;
    seat: "host" | "away";
    createdAt: number;
  }>
) {
  return rows.map((row) => ({
    version: row.version,
    events: row.events,
    command: row.command,
    seat: row.seat,
    createdAt: row.createdAt,
  }));
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get match metadata (status, players, mode, winner).
 * Returns the full match document or null if not found.
 */
export const getMatchMeta = query({
  args: { matchId: v.id("matches") },
  returns: v.union(vMatch, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.matchId);
  },
});

/**
 * Get the masked player view of the current game state.
 * Loads the latest snapshot, deserializes, applies mask(state, seat),
 * and returns a JSON-serialized PlayerView.
 *
 * SECURITY: The mask function strips hidden information (opponent hand,
 * face-down card identities, deck contents) to prevent cheating.
 */
export const getPlayerView = query({
  args: {
    matchId: v.id("matches"),
    seat: v.union(v.literal("host"), v.literal("away")),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const snapshot = await ctx.db
      .query("matchSnapshots")
      .withIndex("by_match_version", (q) => q.eq("matchId", args.matchId))
      .order("desc")
      .first();

    if (!snapshot) return null;

    const state = ensureInstanceMapping(JSON.parse(snapshot.state) as GameState);
    const playerView = mask(state, args.seat as Seat);
    return JSON.stringify(playerView);
  },
});

/**
 * Compute legal commands for the given seat from the latest snapshot.
 * This is the canonical source for client-side action enablement.
 */
export const getLegalMoves = query({
  args: {
    matchId: v.id("matches"),
    seat: vSeat,
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const snapshot = await ctx.db
      .query("matchSnapshots")
      .withIndex("by_match_version", (q) => q.eq("matchId", args.matchId))
      .order("desc")
      .first();

    if (!snapshot) return [];

    const state = ensureInstanceMapping(JSON.parse(snapshot.state) as GameState);
    return computeLegalMoves(state, args.seat as Seat);
  },
});

/**
 * Get event batches after a given version.
 * Used by the client to poll for new events (animations, state transitions).
 */
export const getRecentEvents = query({
  args: {
    matchId: v.id("matches"),
    sinceVersion: v.number(),
  },
  returns: v.array(vMatchEventBatch),
  handler: async (ctx, args) => {
    const recentEvents = await ctx.db
      .query("matchEvents")
      .withIndex("by_match_version", (q) => applySinceVersionIndex(q, args.matchId, args.sinceVersion))
      .order("asc")
      .collect();

    return mapRecentEventsRows(recentEvents);
  },
});

/**
 * Paginated variant of recent events for timeline UIs.
 * Ordered newest-first so clients can render the latest action immediately.
 */
export const getRecentEventsPaginated = query({
  args: {
    matchId: v.id("matches"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const pageResult = await ctx.db
      .query("matchEvents")
      .withIndex("by_match_version", (q) => q.eq("matchId", args.matchId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...pageResult,
      page: mapRecentEventsRows(pageResult.page),
    };
  },
});

export const getLatestSnapshotVersion = query({
  args: {
    matchId: v.id("matches"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const snapshot = await ctx.db
      .query("matchSnapshots")
      .withIndex("by_match_version", (q) => q.eq("matchId", args.matchId))
      .order("desc")
      .first();

    return snapshot?.version ?? -1;
  },
});

/**
 * Get the most recent active (or waiting) match where the given player is host or away.
 * Returns the match document or null if none found.
 */
export const getActiveMatchByHost = query({
  args: { hostId: v.string() },
  returns: v.union(vMatch, v.null()),
  handler: async (ctx, args) => {
    // Check active matches first
    const activeAsHost = await ctx.db
      .query("matches")
      .withIndex("by_host", (q) => q.eq("hostId", args.hostId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .order("desc")
      .first();
    if (activeAsHost) return activeAsHost;

    const activeAsAway = await ctx.db
      .query("matches")
      .withIndex("by_away", (q) => q.eq("awayId", args.hostId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .order("desc")
      .first();
    if (activeAsAway) return activeAsAway;

    // Fall back to waiting matches
    const active = await ctx.db
      .query("matches")
      .withIndex("by_host", (q) => q.eq("hostId", args.hostId))
      .filter((q) => q.eq(q.field("status"), "waiting"))
      .order("desc")
      .first();
    if (active) return active;

    return await ctx.db
      .query("matches")
      .withIndex("by_away", (q) => q.eq("awayId", args.hostId))
      .filter((q) => q.eq(q.field("status"), "waiting"))
      .order("desc")
      .first();
  },
});

/**
 * Get the most recent waiting match where the host has not yet filled the away seat.
 */
export const getOpenLobbyByHost = query({
  args: { hostId: v.string() },
  returns: v.union(vMatch, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matches")
      .withIndex("by_host", (q) => q.eq("hostId", args.hostId))
      .filter((q) => q.eq(q.field("status"), "waiting"))
      .filter((q) => q.eq(q.field("awayId"), null))
      .order("desc")
      .first();
  },
});

/**
 * Get the first unresolved prompt for a player.
 * Returns the prompt document or null if no prompt is pending.
 */
export const getOpenPrompt = query({
  args: {
    matchId: v.id("matches"),
    seat: vSeat,
  },
  returns: v.union(vOpenPrompt, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matchPrompts")
      .withIndex("by_match_seat", (q) =>
        q.eq("matchId", args.matchId).eq("seat", args.seat)
      )
      .filter((q) => q.eq(q.field("resolved"), false))
      .first();
  },
});
