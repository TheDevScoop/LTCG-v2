import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { decide, evolve } from "@lunchtable/engine";
import { DEFAULT_CONFIG } from "@lunchtable/engine";
import type { GameState, Command, Seat, EngineEvent, EngineConfig } from "@lunchtable/engine";

// ---------------------------------------------------------------------------
// Shared validators
// ---------------------------------------------------------------------------

const seatValidator = v.union(v.literal("host"), v.literal("away"));
const END_TURN_MACRO_STEP_LIMIT = 10;

function assertConfigIsDefault(config: unknown) {
  const c = config as EngineConfig | null;
  if (!c || typeof c !== "object") {
    throw new Error("initialState.config is required");
  }

  // We currently only support server-default rules. If this changes, plumb an
  // explicit allowlist into startMatch rather than trusting client input.
  const expected = DEFAULT_CONFIG;
  const mismatch =
    c.startingLP !== expected.startingLP ||
    c.maxHandSize !== expected.maxHandSize ||
    c.startingHandSize !== expected.startingHandSize ||
    c.maxBoardSlots !== expected.maxBoardSlots ||
    c.maxSpellTrapSlots !== expected.maxSpellTrapSlots ||
    c.breakdownThreshold !== expected.breakdownThreshold ||
    c.maxBreakdownsToWin !== expected.maxBreakdownsToWin ||
    c.deckSize?.min !== expected.deckSize.min ||
    c.deckSize?.max !== expected.deckSize.max;

  if (mismatch) {
    throw new Error("initialState.config does not match server defaults");
  }
}

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

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function toMultiset(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function haveSameCardCounts(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = toMultiset(a);
  const right = toMultiset(b);
  if (left.size !== right.size) return false;
  for (const [cardId, count] of left.entries()) {
    if (right.get(cardId) !== count) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidInitialCardDefinition(cardId: string, def: unknown): boolean {
  if (!isRecord(def)) return false;

  // Hard requirements that prevent trivial tampering.
  if (def.id !== cardId) return false;
  if (!isNonEmptyString(def.name)) return false;

  const type = def.type;
  if (type !== "stereotype" && type !== "spell" && type !== "trap") return false;

  // Validate fields that the rules engine depends on.
  if (type === "stereotype") {
    if (!isFiniteNumber(def.level)) return false;
    if (!isFiniteNumber(def.attack)) return false;
    if (!isFiniteNumber(def.defense)) return false;
  }
  if (type === "spell") {
    if (!isNonEmptyString(def.spellType)) return false;
  }
  if (type === "trap") {
    if (!isNonEmptyString(def.trapType)) return false;
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

export function buildChainPromptData(state: GameState, responderSeat: Seat) {
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

export function assertInitialStateIntegrity(
  match: {
    hostId: string;
    awayId: string;
    hostDeck: string[];
    awayDeck: string[] | null;
  },
  state: GameState
) {
  assertConfigIsDefault((state as any).config);

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
    state.hostFieldSpell !== null ||
    state.awayFieldSpell !== null ||
    state.hostGraveyard.length > 0 ||
    state.awayGraveyard.length > 0 ||
    state.hostBanished.length > 0 ||
    state.awayBanished.length > 0
  ) {
    throw new Error("initialState must start with empty board and discard zones");
  }

  if (state.currentChain.length > 0) {
    throw new Error("initialState must start with no active chain");
  }
  if (state.currentPriorityPlayer !== null || state.currentChainPasser !== null) {
    throw new Error("initialState must start with no chain priority state");
  }
  if (state.pendingAction !== null) {
    throw new Error("initialState must start with no pending action");
  }
  if (state.temporaryModifiers.length > 0 || state.lingeringEffects.length > 0) {
    throw new Error("initialState must start with no modifiers or lingering effects");
  }
  if (state.hostNormalSummonedThisTurn || state.awayNormalSummonedThisTurn) {
    throw new Error("initialState must start with no normal summon used");
  }
  if (state.gameOver || state.winner !== null || state.winReason !== null) {
    throw new Error("initialState must not be game over");
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
    const def = (state.cardLookup as any)[cardId] as unknown;
    if (!def) {
      throw new Error(`initialState.cardLookup missing definition for ${cardId}`);
    }
    if (!isValidInitialCardDefinition(cardId, def)) {
      throw new Error(`initialState.cardLookup has invalid definition for ${cardId}`);
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

export const cancelMatch = mutation({
  args: {
    matchId: v.id("matches"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error(`Match ${args.matchId} not found`);
    }
    if (match.status === "ended") {
      return null; // Already ended, idempotent
    }
    if (match.status !== "waiting") {
      throw new Error(`Cannot cancel match in "${match.status}" status`);
    }
    if (match.awayId !== null) {
      throw new Error("Cannot cancel after an away player has joined.");
    }

    await ctx.db.patch(args.matchId, {
      status: "ended",
      endReason: "host_canceled",
      endedAt: Date.now(),
    });

    return null;
  },
});

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

    if (args.expectedVersion !== undefined && latestSnapshot.version !== args.expectedVersion) {
      throw new Error("submitAction version mismatch; state updated by another action.");
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

    // If the engine emits no events, treat the action as invalid/no-op and do
    // not persist a new snapshot or event row. This prevents version churn and
    // event-log spam from illegal commands.
    if (events.length === 0) {
      return {
        events: "[]",
        version: latestSnapshot.version,
      };
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
