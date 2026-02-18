import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { decide, evolve } from "@lunchtable-tcg/engine";
import type { GameState, Command, Seat, EngineEvent } from "@lunchtable-tcg/engine";

// ---------------------------------------------------------------------------
// Shared validators
// ---------------------------------------------------------------------------

const seatValidator = v.union(v.literal("host"), v.literal("away"));
const END_TURN_MACRO_STEP_LIMIT = 10;

function runCommand(
  state: GameState,
  command: Command,
  seat: Seat,
): { events: EngineEvent[]; state: GameState } {
  const events = decide(state, command, seat);
  const nextState = evolve(state, events);
  return { events, state: nextState };
}

function runEndTurnMacro(
  initialState: GameState,
  seat: Seat,
): { events: EngineEvent[]; state: GameState } {
  let state = initialState;
  const allEvents: EngineEvent[] = [];
  const startingTurn = initialState.turnNumber;

  for (let step = 0; step < END_TURN_MACRO_STEP_LIMIT; step++) {
    const result = runCommand(state, { type: "ADVANCE_PHASE" }, seat);
    if (result.events.length === 0) {
      break;
    }

    allEvents.push(...result.events);
    state = result.state;

    if (state.gameOver) break;
    if (state.turnNumber !== startingTurn || state.currentTurnPlayer !== seat) break;
  }

  return { events: allEvents, state };
}

// ---------------------------------------------------------------------------
// createMatch — Insert a new match record in "waiting" status.
// The caller (LTCGMatch client class) provides player IDs, mode, and decks.
// ---------------------------------------------------------------------------

export const createMatch = mutation({
  args: {
    hostId: v.string(),
    awayId: v.optional(v.string()),
    mode: v.union(v.literal("pvp"), v.literal("story")),
    hostDeck: v.array(v.string()),
    awayDeck: v.optional(v.array(v.string())),
    isAIOpponent: v.boolean(),
  },
  returns: v.id("matches"),
  handler: async (ctx, args) => {
    const matchId = await ctx.db.insert("matches", {
      hostId: args.hostId,
      awayId: args.awayId ?? null,
      mode: args.mode,
      status: "waiting",
      hostDeck: args.hostDeck,
      awayDeck: args.awayDeck ?? null,
      isAIOpponent: args.isAIOpponent,
      createdAt: Date.now(),
    });

    return matchId;
  },
});

// ---------------------------------------------------------------------------
// joinMatch — fill the away seat in an existing waiting match.
//
// The match must be in "waiting" state and currently unoccupied on the away seat.
// ---------------------------------------------------------------------------

export const joinMatch = mutation({
  args: {
    matchId: v.id("matches"),
    awayId: v.string(),
    awayDeck: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error(`Match ${args.matchId} not found`);
    }

    if (match.status !== "waiting") {
      throw new Error(`Match ${args.matchId} is "${match.status}", expected "waiting"`);
    }

    if (match.awayId !== null) {
      throw new Error(`Match ${args.matchId} already has an away player`);
    }

    if (match.hostId === args.awayId) {
      throw new Error("Cannot join your own match as away seat.");
    }

    await ctx.db.patch(args.matchId, {
      awayId: args.awayId,
      awayDeck: args.awayDeck,
    });

    return null;
  },
});

// ---------------------------------------------------------------------------
// startMatch — Transition a match from "waiting" to "active".
//
// The client is responsible for calling createInitialState() from the engine
// and serializing the result to JSON. This keeps the mutation thin and avoids
// requiring card definitions inside the Convex component at mutation time.
// ---------------------------------------------------------------------------

export const startMatch = mutation({
  args: {
    matchId: v.id("matches"),
    initialState: v.string(), // JSON-serialized GameState from engine
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error(`Match ${args.matchId} not found`);
    }
    if (match.status !== "waiting") {
      throw new Error(
        `Match ${args.matchId} is "${match.status}", expected "waiting"`
      );
    }

    // Validate that initialState is parseable JSON before persisting
    try {
      JSON.parse(args.initialState);
    } catch {
      throw new Error("initialState is not valid JSON");
    }

    // Transition match to active
    await ctx.db.patch(args.matchId, {
      status: "active",
      startedAt: Date.now(),
    });

    // Persist the initial snapshot at version 0
    await ctx.db.insert("matchSnapshots", {
      matchId: args.matchId,
      version: 0,
      state: args.initialState,
      createdAt: Date.now(),
    });

    return null;
  },
});

// ---------------------------------------------------------------------------
// submitAction — The core decide / evolve / persist loop.
//
// 1. Load the latest snapshot for the match.
// 2. Deserialize state, optionally inject a fresh cardLookup.
// 3. Run decide() to produce events, then evolve() to derive new state.
// 4. Persist the new snapshot and append the event log entry.
// 5. If the game is over, finalize the match record.
// ---------------------------------------------------------------------------

export const submitAction = mutation({
  args: {
    matchId: v.id("matches"),
    command: v.string(), // JSON-serialized Command
    seat: seatValidator,
    expectedVersion: v.optional(v.number()),
    cardLookup: v.optional(v.string()), // JSON-serialized Record<string, CardDefinition>
  },
  returns: v.object({
    events: v.string(), // JSON-serialized EngineEvent[]
    version: v.number(),
  }),
  handler: async (ctx, args) => {
    // -----------------------------------------------------------------------
    // 1. Validate match is active
    // -----------------------------------------------------------------------
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error(`Match ${args.matchId} not found`);
    }
    if (match.status !== "active") {
      throw new Error(
        `Match ${args.matchId} is "${match.status}", expected "active"`
      );
    }

    // -----------------------------------------------------------------------
    // 2. Load latest snapshot (highest version for this match)
    // -----------------------------------------------------------------------
    const latestSnapshot = await ctx.db
      .query("matchSnapshots")
      .withIndex("by_match_version", (q) => q.eq("matchId", args.matchId))
      .order("desc")
      .first();

    if (!latestSnapshot) {
      throw new Error(
        `No snapshot found for match ${args.matchId} — was startMatch called?`
      );
    }

    if (args.expectedVersion !== undefined && latestSnapshot.version !== args.expectedVersion) {
      throw new Error("submitAction version mismatch; state updated by another action.");
    }

    // -----------------------------------------------------------------------
    // 3. Deserialize state and optionally inject cardLookup
    // -----------------------------------------------------------------------
    let state: GameState;
    try {
      state = JSON.parse(latestSnapshot.state) as GameState;
    } catch {
      throw new Error("Failed to parse snapshot state");
    }

    if (args.cardLookup) {
      try {
        state.cardLookup = JSON.parse(args.cardLookup);
      } catch {
        throw new Error("Failed to parse cardLookup");
      }
    }

    // -----------------------------------------------------------------------
    // 4. Parse command
    // -----------------------------------------------------------------------
    let parsedCommand: Command;
    try {
      parsedCommand = JSON.parse(args.command) as Command;
    } catch {
      throw new Error("Failed to parse command");
    }

    // -----------------------------------------------------------------------
    // 5. Run decide/evolve
    // END_TURN is treated as a macro of ADVANCE_PHASE steps until the turn
    // actually changes, game ends, or a deterministic safety ceiling is hit.
    // -----------------------------------------------------------------------
    let events: EngineEvent[] = [];
    let newState: GameState = state;
    try {
      if (parsedCommand.type === "END_TURN") {
        const macroResult = runEndTurnMacro(state, args.seat as Seat);
        events = macroResult.events;
        newState = macroResult.state;
      } else {
        const result = runCommand(state, parsedCommand, args.seat as Seat);
        events = result.events;
        newState = result.state;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Engine decide()/evolve() failed: ${message}`);
    }

    // -----------------------------------------------------------------------
    // 7. Persist new snapshot
    // -----------------------------------------------------------------------
    const newVersion = latestSnapshot.version + 1;

    await ctx.db.insert("matchSnapshots", {
      matchId: args.matchId,
      version: newVersion,
      state: JSON.stringify(newState),
      createdAt: Date.now(),
    });

    // -----------------------------------------------------------------------
    // 8. Append event log entry
    // -----------------------------------------------------------------------
    await ctx.db.insert("matchEvents", {
      matchId: args.matchId,
      version: newVersion,
      events: JSON.stringify(events),
      command: args.command,
      seat: args.seat,
      createdAt: Date.now(),
    });

    // -----------------------------------------------------------------------
    // 9. If game over, finalize the match record
    // -----------------------------------------------------------------------
    if (newState.gameOver) {
      await ctx.db.patch(args.matchId, {
        status: "ended" as const,
        winner: newState.winner ?? undefined,
        endReason: newState.winReason ?? undefined,
        endedAt: Date.now(),
      });
    }

    return {
      events: JSON.stringify(events),
      version: newVersion,
    };
  },
});
