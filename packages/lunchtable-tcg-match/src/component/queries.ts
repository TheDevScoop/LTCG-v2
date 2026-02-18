import { v } from "convex/values";
import { query } from "./_generated/server";
import { mask } from "@lunchtable-tcg/engine";
import type { GameState, Seat } from "@lunchtable-tcg/engine";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get match metadata (status, players, mode, winner).
 * Returns the full match document or null if not found.
 */
export const getMatchMeta = query({
  args: { matchId: v.id("matches") },
  returns: v.any(),
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

    const state = JSON.parse(snapshot.state) as GameState;
    const playerView = mask(state, args.seat as Seat);
    return JSON.stringify(playerView);
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
  returns: v.any(),
  handler: async (ctx, args) => {
    const recentEvents = await ctx.db
      .query("matchEvents")
      .withIndex("by_match_version", (q) =>
        q.eq("matchId", args.matchId).gt("version", args.sinceVersion)
      )
      .order("asc")
      .collect();

    return recentEvents.map((e) => ({
        version: e.version,
        events: e.events,
        command: e.command,
        seat: e.seat,
        createdAt: e.createdAt,
      }));
  },
});

/**
 * Get the most recent active (or waiting) match where the given player is host or away.
 * Returns the match document or null if none found.
 */
export const getActiveMatchByHost = query({
  args: { hostId: v.string() },
  returns: v.any(),
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
  returns: v.any(),
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
    seat: v.union(v.literal("host"), v.literal("away")),
  },
  returns: v.any(),
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
