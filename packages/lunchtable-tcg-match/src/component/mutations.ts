import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { decide, evolve } from "@lunchtable-tcg/engine";
import type { GameState, Command, Seat } from "@lunchtable-tcg/engine";

// ---------------------------------------------------------------------------
// Shared validators
// ---------------------------------------------------------------------------

const seatValidator = v.union(v.literal("host"), v.literal("away"));

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function toMultiset(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function haveSameCardCounts(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = toMultiset(a);
  const right = toMultiset(b);
  if (left.size !== right.size) return false;
  for (const [cardId, count] of left.entries()) {
    if (right.get(cardId) !== count) return false;
  }
  return true;
}

function resolveDefinitionIdForChainCard(
  state: GameState,
  seat: Seat,
  cardId: string
): string {
  const spellTrapZone = seat === "host" ? state.hostSpellTrapZone : state.awaySpellTrapZone;
  const fieldSpell = seat === "host" ? state.hostFieldSpell : state.awayFieldSpell;
  const setCard = spellTrapZone.find((card) => card.cardId === cardId);
  if (setCard?.definitionId) return setCard.definitionId;
  if (fieldSpell?.cardId === cardId && fieldSpell.definitionId) return fieldSpell.definitionId;
  return cardId;
}

function buildChainPromptData(state: GameState, responderSeat: Seat) {
  const link = state.currentChain[state.currentChain.length - 1];
  const opponentCardId = link?.cardId;
  const opponentCardDefinitionId =
    link && opponentCardId
      ? resolveDefinitionIdForChainCard(state, link.activatingPlayer, opponentCardId)
      : undefined;
  const opponentCardName =
    typeof opponentCardDefinitionId === "string"
      ? state.cardLookup?.[opponentCardDefinitionId]?.name ?? "Opponent Card"
      : "Opponent Card";

  const responderTrapZone = responderSeat === "host" ? state.hostSpellTrapZone : state.awaySpellTrapZone;
  const activatableTraps = responderTrapZone
    .filter((card) => card.faceDown)
    .map((card) => {
      const definition = state.cardLookup?.[card.definitionId];
      if (!definition || definition.type !== "trap") return null;
      return {
        cardId: card.cardId,
        cardDefinitionId: card.definitionId,
        name: definition.name ?? "Set Trap",
      };
    })
    .filter((entry): entry is { cardId: string; cardDefinitionId: string; name: string } => entry !== null);

  return {
    opponentCardId,
    opponentCardDefinitionId,
    opponentCardName,
    activatableTrapIds: activatableTraps.map((trap) => trap.cardId),
    activatableTraps,
  };
}

function assertInitialStateIntegrity(
  match: {
    hostId: string;
    awayId: string;
    hostDeck: string[];
    awayDeck: string[] | null;
  },
  state: GameState
) {
  if (state.hostId !== match.hostId) {
    throw new Error("initialState hostId does not match match.hostId");
  }
  if (state.awayId !== match.awayId) {
    throw new Error("initialState awayId does not match match.awayId");
  }

  if (
    state.hostBoard.length > 0 ||
    state.awayBoard.length > 0 ||
    state.hostSpellTrapZone.length > 0 ||
    state.awaySpellTrapZone.length > 0 ||
    state.hostGraveyard.length > 0 ||
    state.awayGraveyard.length > 0 ||
    state.hostBanished.length > 0 ||
    state.awayBanished.length > 0
  ) {
    throw new Error("initialState must start with empty board and discard zones");
  }

  const expectedHostDeck = match.hostDeck ?? [];
  const expectedAwayDeck = match.awayDeck ?? [];
  const actualHostCards = [...state.hostHand, ...state.hostDeck];
  const actualAwayCards = [...state.awayHand, ...state.awayDeck];
  if (!haveSameCardCounts(expectedHostDeck, actualHostCards)) {
    throw new Error("initialState host deck/hand does not match match.hostDeck");
  }
  if (!haveSameCardCounts(expectedAwayDeck, actualAwayCards)) {
    throw new Error("initialState away deck/hand does not match match.awayDeck");
  }

  if (!state.cardLookup || typeof state.cardLookup !== "object") {
    throw new Error("initialState.cardLookup is required");
  }

  const allReferencedCards = [...actualHostCards, ...actualAwayCards];
  for (const cardId of allReferencedCards) {
    if (!state.cardLookup[cardId]) {
      throw new Error(`initialState.cardLookup missing definition for ${cardId}`);
    }
  }
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
    if (!match.awayId) {
      throw new Error("Cannot start match until away seat is filled");
    }

    // Validate that initialState is parseable and consistent with server-owned match state.
    let parsedInitialState: GameState;
    try {
      parsedInitialState = JSON.parse(args.initialState) as GameState;
    } catch {
      throw new Error("initialState is not valid JSON");
    }
    if (
      !parsedInitialState ||
      !isStringArray(parsedInitialState.hostHand) ||
      !isStringArray(parsedInitialState.hostDeck) ||
      !isStringArray(parsedInitialState.awayHand) ||
      !isStringArray(parsedInitialState.awayDeck)
    ) {
      throw new Error("initialState is missing required deck/hand arrays");
    }
    assertInitialStateIntegrity(
      {
        hostId: match.hostId,
        awayId: match.awayId,
        hostDeck: match.hostDeck,
        awayDeck: match.awayDeck ?? [],
      },
      parsedInitialState
    );

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
    if (args.seat === "away" && !match.awayId) {
      throw new Error(`Match ${args.matchId} has no away player`);
    }
    if (args.cardLookup !== undefined) {
      throw new Error("cardLookup overrides are not allowed");
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

    // -----------------------------------------------------------------------
    // 3. Deserialize state
    // -----------------------------------------------------------------------
    let state: GameState;
    try {
      state = JSON.parse(latestSnapshot.state) as GameState;
    } catch {
      throw new Error("Failed to parse snapshot state");
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
    // 5. Run decide() — produces events for the command
    // -----------------------------------------------------------------------
    let events;
    try {
      events = decide(state, parsedCommand, args.seat as Seat);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Engine decide() failed: ${message}`);
    }

    // -----------------------------------------------------------------------
    // 6. Run evolve() — apply events to produce new state
    // -----------------------------------------------------------------------
    let newState: GameState;
    try {
      newState = evolve(state, events);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Engine evolve() failed: ${message}`);
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
    // 9. Refresh chain response prompts from authoritative chain state
    // -----------------------------------------------------------------------
    const now = Date.now();
    const unresolvedChainPrompts = await ctx.db
      .query("matchPrompts")
      .withIndex("by_match_unresolved", (q) =>
        q.eq("matchId", args.matchId).eq("resolved", false)
      )
      .collect();

    for (const prompt of unresolvedChainPrompts) {
      if (prompt.promptType !== "chain_response") continue;
      await ctx.db.patch(prompt._id, {
        resolved: true,
        resolvedAt: now,
      });
    }

    if (newState.currentChain.length > 0 && newState.currentPriorityPlayer) {
      await ctx.db.insert("matchPrompts", {
        matchId: args.matchId,
        seat: newState.currentPriorityPlayer,
        promptType: "chain_response",
        data: JSON.stringify(buildChainPromptData(newState, newState.currentPriorityPlayer)),
        resolved: false,
        createdAt: now,
      });
    }

    // -----------------------------------------------------------------------
    // 10. If game over, finalize the match record
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
