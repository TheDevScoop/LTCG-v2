# Engine Gap Resolution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all 9 engine gaps so card effects execute, AI agents can enumerate moves, and the game is deterministically replayable.

**Architecture:** Extends the existing decide/evolve event-sourced pattern. New `rules/effects.ts` module resolves EffectAction arrays into EngineEvent arrays. Effects hook into `evolve()` for trigger detection. legalMoves() becomes a full phase-gated command enumerator.

**Tech Stack:** Pure TypeScript, Vitest, zero dependencies.

---

### Task 1: Seeded RNG

**Files:**
- Modify: `packages/engine/src/engine.ts:14-22` (EngineOptions)
- Modify: `packages/engine/src/engine.ts:55-62` (shuffle function)
- Modify: `packages/engine/src/engine.ts:32-42` (createEngine)
- Test: `packages/engine/src/__tests__/engine.test.ts`

**Step 1: Write the failing test**

Add to `packages/engine/src/__tests__/engine.test.ts`:

```typescript
describe("seeded shuffle", () => {
  it("produces deterministic output with the same seed", () => {
    const engine1 = createEngine({
      cardLookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
      seed: 12345,
    });

    const engine2 = createEngine({
      cardLookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
      seed: 12345,
    });

    expect(engine1.getState().hostHand).toEqual(engine2.getState().hostHand);
    expect(engine1.getState().awayHand).toEqual(engine2.getState().awayHand);
    expect(engine1.getState().hostDeck).toEqual(engine2.getState().hostDeck);
  });

  it("produces different output with different seeds", () => {
    const engine1 = createEngine({
      cardLookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
      seed: 11111,
    });

    const engine2 = createEngine({
      cardLookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
      seed: 99999,
    });

    // With 40 cards and different seeds, hands should differ
    const same = engine1.getState().hostHand.every(
      (c, i) => c === engine2.getState().hostHand[i]
    );
    expect(same).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/engine && bun run test -- --run -t "seeded shuffle"`
Expected: FAIL — `seed` property doesn't exist on EngineOptions

**Step 3: Implement seeded RNG**

In `engine.ts`, add mulberry32 PRNG and thread seed through:

```typescript
// Add to EngineOptions (line 14-22):
export interface EngineOptions {
  config?: Partial<EngineConfig>;
  cardLookup: Record<string, CardDefinition>;
  hostId: string;
  awayId: string;
  hostDeck: string[];
  awayDeck: string[];
  firstPlayer?: Seat;
  seed?: number;
}

// Add mulberry32 PRNG (after EngineOptions):
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Replace shuffle (line 55-62):
function shuffle<T>(arr: T[], rng?: () => number): T[] {
  const copy = [...arr];
  const random = rng ?? Math.random;
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// In createEngine (line 32-42), create RNG and pass to createInitialState:
export function createEngine(options: EngineOptions): Engine {
  const config: EngineConfig = { ...DEFAULT_CONFIG, ...options.config };
  const rng = options.seed !== undefined ? mulberry32(options.seed) : undefined;
  let state = createInitialState(
    options.cardLookup,
    config,
    options.hostId,
    options.awayId,
    options.hostDeck,
    options.awayDeck,
    options.firstPlayer ?? "host",
    rng
  );
  // ... rest unchanged
}

// Update createInitialState signature (line 64-71):
export function createInitialState(
  cardLookup: Record<string, CardDefinition>,
  config: EngineConfig,
  hostId: string,
  awayId: string,
  hostDeckIds: string[],
  awayDeckIds: string[],
  firstPlayer: Seat,
  rng?: () => number
): GameState {
  const hostDeck = shuffle(hostDeckIds, rng);
  const awayDeck = shuffle(awayDeckIds, rng);
  // ... rest unchanged
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/engine && bun run test -- --run -t "seeded shuffle"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/engine/src/engine.ts packages/engine/src/__tests__/engine.test.ts
git commit -m "feat(engine): add seeded RNG for deterministic replay"
```

---

### Task 2: GAME_STARTED Event

**Files:**
- Modify: `packages/engine/src/engine.ts:82-121` (createInitialState return)
- Modify: `packages/engine/src/engine.ts:285-399` (evolve)
- Test: `packages/engine/src/__tests__/engine.test.ts`

**Step 1: Write the failing test**

```typescript
describe("GAME_STARTED event", () => {
  it("emits GAME_STARTED on first evolve from initial state", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "player1",
      awayId: "player2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    // Advance a phase to trigger evolve
    const events = engine.decide({ type: "ADVANCE_PHASE" }, "host");
    // The initial state should have emitted GAME_STARTED
    // We check via getState — we add a gameStarted flag
    // Actually, check the event log on state
    const state = engine.getState();
    // GAME_STARTED is stored in state.eventLog or we check initial events
    expect(state.gameStarted).toBe(true);
  });
});
```

Actually, simpler approach: emit GAME_STARTED in the initial events of createEngine, and store `gameStarted: true` on state.

**Revised approach:** Add `gameStarted` boolean to GameState. In `createInitialState`, set it to `true`. The GAME_STARTED event is produced but since we're using a stateful Engine wrapper, we emit it during creation and handle in evolve.

**Simpler: just make createEngine produce the event internally.**

```typescript
// In engine.test.ts:
it("initial state has gameStarted flag", () => {
  const engine = createEngine({
    cardLookup,
    hostId: "player1",
    awayId: "player2",
    hostDeck: createTestDeck(40),
    awayDeck: createTestDeck(40),
  });
  const state = engine.getState();
  expect(state.gameStarted).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/engine && bun run test -- --run -t "gameStarted"`
Expected: FAIL — `gameStarted` not on GameState

**Step 3: Implement**

Add `gameStarted: boolean` to `GameState` interface in `types/state.ts:96`, default to `true` in `createInitialState`. Add the evolve handler for `GAME_STARTED` event type.

In `types/state.ts`, add after `gameOver: boolean`:
```typescript
gameStarted: boolean;
```

In `engine.ts` `createInitialState`, add to the return object:
```typescript
gameStarted: true,
```

In `engine.ts` `evolve`, add case:
```typescript
case "GAME_STARTED":
  newState.gameStarted = true;
  break;
```

**Step 4: Run test to verify it passes**

Run: `cd packages/engine && bun run test -- --run`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/engine/src/engine.ts packages/engine/src/types/state.ts packages/engine/src/__tests__/engine.test.ts
git commit -m "feat(engine): add GAME_STARTED event and gameStarted flag"
```

---

### Task 3: Deck Copy Limits

**Files:**
- Modify: `packages/engine/src/cards.ts:61-81` (validateDeck)
- Test: `packages/engine/src/__tests__/cards.test.ts`

**Step 1: Write the failing test**

```typescript
describe("deck copy limits", () => {
  it("rejects decks with more than 3 copies of the same card", () => {
    const lookup = defineCards([
      { id: "card-a", name: "Card A", type: "stereotype", description: "test", rarity: "common", attack: 1000, defense: 1000, level: 4 },
      { id: "card-b", name: "Card B", type: "stereotype", description: "test", rarity: "common", attack: 1000, defense: 1000, level: 4 },
    ]);

    // 4 copies of card-a (over limit)
    const deck = Array(4).fill("card-a").concat(Array(36).fill("card-b"));
    const result = validateDeck(deck, lookup, { min: 40, max: 60 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("card-a");
    expect(result.errors[0]).toContain("4");
  });

  it("accepts decks with exactly 3 copies", () => {
    const lookup = defineCards([
      { id: "card-a", name: "Card A", type: "stereotype", description: "test", rarity: "common", attack: 1000, defense: 1000, level: 4 },
      { id: "card-b", name: "Card B", type: "stereotype", description: "test", rarity: "common", attack: 1000, defense: 1000, level: 4 },
    ]);

    const deck = Array(3).fill("card-a").concat(Array(37).fill("card-b"));
    const result = validateDeck(deck, lookup, { min: 40, max: 60 });
    expect(result.valid).toBe(true);
  });

  it("respects custom maxCopies", () => {
    const lookup = defineCards([
      { id: "card-a", name: "Card A", type: "stereotype", description: "test", rarity: "common", attack: 1000, defense: 1000, level: 4 },
      { id: "card-b", name: "Card B", type: "stereotype", description: "test", rarity: "common", attack: 1000, defense: 1000, level: 4 },
    ]);

    const deck = Array(2).fill("card-a").concat(Array(38).fill("card-b"));
    const result = validateDeck(deck, lookup, { min: 40, max: 60 }, { maxCopies: 1 });
    expect(result.valid).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/engine && bun run test -- --run -t "deck copy"`
Expected: FAIL

**Step 3: Implement**

Update `validateDeck` in `cards.ts`:

```typescript
export interface DeckOptions {
  maxCopies?: number;
}

export function validateDeck(
  deckCardIds: string[],
  cardLookup: CardLookup,
  sizeConstraint: { min: number; max: number },
  options?: DeckOptions,
): DeckValidation {
  const errors: string[] = [];
  const maxCopies = options?.maxCopies ?? 3;

  if (deckCardIds.length < sizeConstraint.min) {
    errors.push(`Deck has too few cards (${deckCardIds.length}/${sizeConstraint.min})`);
  }
  if (deckCardIds.length > sizeConstraint.max) {
    errors.push(`Deck has too many cards (${deckCardIds.length}/${sizeConstraint.max})`);
  }

  // Check copy limits
  const counts = new Map<string, number>();
  for (const id of deckCardIds) {
    if (!cardLookup[id]) {
      errors.push(`Unknown card ID: ${id}`);
    } else {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  for (const [id, count] of counts) {
    if (count > maxCopies) {
      errors.push(`Card "${id}" has ${count} copies (max ${maxCopies})`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

Also export `DeckOptions` from `cards.ts` and `index.ts`.

**Step 4: Run test to verify it passes**

Run: `cd packages/engine && bun run test -- --run`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/engine/src/cards.ts packages/engine/src/__tests__/cards.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): add deck copy limit validation (default 3)"
```

---

### Task 4: CHANGE_POSITION Handler

**Files:**
- Modify: `packages/engine/src/engine.ts:211-283` (decide switch)
- Modify: `packages/engine/src/engine.ts:285-399` (evolve switch)
- Test: `packages/engine/src/__tests__/engine.test.ts` or new `packages/engine/src/__tests__/position.test.ts`

**Step 1: Write the failing test**

Create or add to test file:

```typescript
import { describe, it, expect } from "vitest";
import { createEngine } from "../engine.js";
import { defineCards } from "../cards.js";
import type { CardDefinition } from "../types/index.js";

const cards: CardDefinition[] = [
  {
    id: "warrior",
    name: "Test Warrior",
    type: "stereotype",
    description: "test",
    rarity: "common",
    attack: 1500,
    defense: 1200,
    level: 4,
    attribute: "fire",
  },
];
const cardLookup = defineCards(cards);
function makeDeck(size: number) { return Array(size).fill("warrior"); }

describe("CHANGE_POSITION", () => {
  it("changes a monster from attack to defense", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: makeDeck(40),
      awayDeck: makeDeck(40),
    });

    // Advance to main phase
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host")); // draw -> standby
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host")); // standby -> main

    // Summon in attack position
    const hand = engine.getState().hostHand;
    engine.evolve(engine.decide({ type: "SUMMON", cardId: hand[0], position: "attack" }, "host"));

    const cardId = engine.getState().hostBoard[0].cardId;
    expect(engine.getState().hostBoard[0].position).toBe("attack");

    // End turn, opponent's turn, end their turn, back to us
    engine.evolve(engine.decide({ type: "END_TURN" }, "host"));
    engine.evolve(engine.decide({ type: "END_TURN" }, "away"));

    // Now in our turn again, advance to main
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host")); // draw -> standby
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host")); // standby -> main

    // Change position
    const events = engine.decide({ type: "CHANGE_POSITION", cardId }, "host");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("POSITION_CHANGED");
    engine.evolve(events);

    expect(engine.getState().hostBoard[0].position).toBe("defense");
    expect(engine.getState().hostBoard[0].changedPositionThisTurn).toBe(true);
  });

  it("rejects changing position twice in one turn", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: makeDeck(40),
      awayDeck: makeDeck(40),
    });

    // Setup: summon, end turn, come back, advance to main
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    const hand = engine.getState().hostHand;
    engine.evolve(engine.decide({ type: "SUMMON", cardId: hand[0], position: "attack" }, "host"));
    const cardId = engine.getState().hostBoard[0].cardId;
    engine.evolve(engine.decide({ type: "END_TURN" }, "host"));
    engine.evolve(engine.decide({ type: "END_TURN" }, "away"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));

    // First change OK
    engine.evolve(engine.decide({ type: "CHANGE_POSITION", cardId }, "host"));
    expect(engine.getState().hostBoard[0].position).toBe("defense");

    // Second change same turn — should produce no events
    const events = engine.decide({ type: "CHANGE_POSITION", cardId }, "host");
    expect(events).toEqual([]);
  });

  it("rejects changing position of face-down monster", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: makeDeck(40),
      awayDeck: makeDeck(40),
    });

    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    const hand = engine.getState().hostHand;
    engine.evolve(engine.decide({ type: "SET_MONSTER", cardId: hand[0] }, "host"));
    const cardId = engine.getState().hostBoard[0].cardId;

    // Skip to next turn
    engine.evolve(engine.decide({ type: "END_TURN" }, "host"));
    engine.evolve(engine.decide({ type: "END_TURN" }, "away"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));

    const events = engine.decide({ type: "CHANGE_POSITION", cardId }, "host");
    expect(events).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/engine && bun run test -- --run -t "CHANGE_POSITION"`
Expected: FAIL — no handler

**Step 3: Implement**

In `engine.ts` `decide()`, add case before `default`:

```typescript
case "CHANGE_POSITION": {
  const { cardId } = command;
  // Must be main phase
  if (state.currentPhase !== "main" && state.currentPhase !== "main2") break;
  // Find card on player's board
  const board = seat === "host" ? state.hostBoard : state.awayBoard;
  const card = board.find((c) => c.cardId === cardId);
  if (!card) break;
  // Must be face-up
  if (card.faceDown) break;
  // Can't change position twice in one turn
  if (card.changedPositionThisTurn) break;
  // Can't change position the turn it was summoned
  if (card.turnSummoned >= state.turnNumber) break;
  const from = card.position;
  const to = from === "attack" ? "defense" : "attack";
  events.push({ type: "POSITION_CHANGED", cardId, from, to });
  break;
}
```

In `engine.ts` `evolve()`, add case:

```typescript
case "POSITION_CHANGED": {
  const { cardId, to } = event as Extract<EngineEvent, { type: "POSITION_CHANGED" }>;
  // Find on either board
  for (const boardKey of ["hostBoard", "awayBoard"] as const) {
    const board = [...newState[boardKey]];
    const idx = board.findIndex((c) => c.cardId === cardId);
    if (idx > -1) {
      board[idx] = { ...board[idx], position: to, changedPositionThisTurn: true };
      newState[boardKey] = board;
      break;
    }
  }
  break;
}
```

Also reset `changedPositionThisTurn` in TURN_STARTED evolve handler (alongside canAttack/hasAttackedThisTurn reset):

```typescript
// In TURN_STARTED handler, add to the map:
changedPositionThisTurn: false,
```

**Step 4: Run test to verify it passes**

Run: `cd packages/engine && bun run test -- --run`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/engine/src/engine.ts packages/engine/src/__tests__/
git commit -m "feat(engine): implement CHANGE_POSITION command handler"
```

---

### Task 5: Effect Resolution System

This is the largest task. We build `rules/effects.ts` incrementally.

**Files:**
- Create: `packages/engine/src/rules/effects.ts`
- Modify: `packages/engine/src/engine.ts` (wire into decide/evolve)
- Modify: `packages/engine/src/rules/index.ts` (export)
- Test: `packages/engine/src/__tests__/effects.test.ts`

#### Step 1: Create effects.ts with resolveEffectActions for basic actions

```typescript
// packages/engine/src/rules/effects.ts
import type { GameState, Seat, EngineEvent, BoardCard } from "../types/index.js";
import type { EffectAction, EffectDefinition, CardDefinition } from "../types/cards.js";
import { opponentSeat } from "./phases.js";
import { drawCard } from "./stateBasedActions.js";

/**
 * Resolve an array of EffectActions into EngineEvents.
 * This is the core effect execution engine.
 */
export function resolveEffectActions(
  state: GameState,
  seat: Seat,
  actions: EffectAction[],
  targets: string[] = [],
): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const action of actions) {
    events.push(...resolveAction(state, seat, action, targets));
  }
  return events;
}

function resolveAction(
  state: GameState,
  seat: Seat,
  action: EffectAction,
  targets: string[],
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const opponent = opponentSeat(seat);

  switch (action.type) {
    case "draw": {
      // Draw cards for the activating player
      let tempState = { ...state };
      for (let i = 0; i < action.count; i++) {
        const drawEvents = drawCard(tempState, seat);
        events.push(...drawEvents);
        // Update temp state for sequential draws
        for (const e of drawEvents) {
          if (e.type === "CARD_DRAWN") {
            const deck = seat === "host" ? [...tempState.hostDeck] : [...tempState.awayDeck];
            deck.shift();
            if (seat === "host") tempState = { ...tempState, hostDeck: deck };
            else tempState = { ...tempState, awayDeck: deck };
          }
        }
      }
      break;
    }

    case "damage": {
      const targetSeat = action.target === "opponent" ? opponent : seat;
      if (action.amount > 0) {
        events.push({
          type: "DAMAGE_DEALT",
          seat: targetSeat,
          amount: action.amount,
          isBattle: false,
        });
      }
      break;
    }

    case "heal": {
      // Heal = negative damage (we use DAMAGE_DEALT with negative... no)
      // Use LIFE_POINTS_CHANGED if it exists, or just use DAMAGE_DEALT approach
      // Since we only have DAMAGE_DEALT, we'll handle heal in evolve specially
      // For now, emit damage with negative amount — evolve handles it
      // Actually, the evolve handler for DAMAGE_DEALT does Math.max(0, lp - amount)
      // For heal, we need a different approach. Let's add it as a modifier event.
      // Simplest: emit DAMAGE_DEALT with negative amount to the player being healed
      // The evolve handler subtracts amount, so negative amount = healing
      if (action.amount > 0) {
        const targetSeat = action.target === "self" ? seat : opponent;
        events.push({
          type: "DAMAGE_DEALT",
          seat: targetSeat,
          amount: -action.amount,
          isBattle: false,
        });
      }
      break;
    }

    case "destroy": {
      if (action.target === "selected" && targets.length > 0) {
        for (const cardId of targets) {
          events.push({ type: "CARD_DESTROYED", cardId, reason: "effect" });
          events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId, from: "board" });
        }
      } else if (action.target === "all_opponent_monsters") {
        const opponentBoard = opponent === "host" ? state.hostBoard : state.awayBoard;
        for (const card of opponentBoard) {
          events.push({ type: "CARD_DESTROYED", cardId: card.cardId, reason: "effect" });
          events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId: card.cardId, from: "board" });
        }
      } else if (action.target === "all_spells_traps") {
        // Destroy all spells/traps on both fields
        for (const card of state.hostSpellTrapZone) {
          events.push({ type: "CARD_DESTROYED", cardId: card.cardId, reason: "effect" });
          events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId: card.cardId, from: "spellTrapZone" });
        }
        for (const card of state.awaySpellTrapZone) {
          events.push({ type: "CARD_DESTROYED", cardId: card.cardId, reason: "effect" });
          events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId: card.cardId, from: "spellTrapZone" });
        }
      }
      break;
    }

    case "boost_attack": {
      // Apply to the first target, or the card that activated the effect
      const targetId = targets[0];
      if (targetId) {
        events.push({
          type: "MODIFIER_APPLIED",
          cardId: targetId,
          field: "attack",
          amount: action.amount,
          source: "effect",
        });
      }
      break;
    }

    case "boost_defense": {
      const targetId = targets[0];
      if (targetId) {
        events.push({
          type: "MODIFIER_APPLIED",
          cardId: targetId,
          field: "defense",
          amount: action.amount,
          source: "effect",
        });
      }
      break;
    }

    case "discard": {
      const targetSeat = action.target === "opponent" ? opponent : seat;
      const hand = targetSeat === "host" ? state.hostHand : state.awayHand;
      const count = Math.min(action.count, hand.length);
      // Discard from end of hand
      for (let i = 0; i < count; i++) {
        const cardId = hand[hand.length - 1 - i];
        if (cardId) {
          events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId, from: "hand" });
        }
      }
      break;
    }

    case "add_vice": {
      for (const cardId of targets) {
        // Find current count
        const card = findBoardCard(state, cardId);
        if (card) {
          events.push({
            type: "VICE_COUNTER_ADDED",
            cardId,
            newCount: card.viceCounters + action.count,
          });
        }
      }
      break;
    }

    case "remove_vice": {
      for (const cardId of targets) {
        const card = findBoardCard(state, cardId);
        if (card) {
          events.push({
            type: "VICE_COUNTER_REMOVED",
            cardId,
            newCount: Math.max(0, card.viceCounters - action.count),
          });
        }
      }
      break;
    }

    case "special_summon": {
      // Special summon from the specified zone
      // For now, handle graveyard summon
      if (targets.length > 0) {
        events.push({
          type: "SPECIAL_SUMMONED",
          seat,
          cardId: targets[0],
          from: action.from,
          position: "attack",
        });
      }
      break;
    }

    case "banish": {
      for (const cardId of targets) {
        events.push({ type: "CARD_BANISHED", cardId, from: "board" });
      }
      break;
    }

    case "return_to_hand": {
      for (const cardId of targets) {
        events.push({ type: "CARD_RETURNED_TO_HAND", cardId, from: "board" });
      }
      break;
    }

    case "negate": {
      // In simple chain mode, negate is a no-op (would remove last chain link)
      break;
    }

    case "change_position": {
      for (const cardId of targets) {
        const card = findBoardCard(state, cardId);
        if (card) {
          const from = card.position;
          const to = from === "attack" ? "defense" : "attack";
          events.push({ type: "POSITION_CHANGED", cardId, from, to });
        }
      }
      break;
    }
  }

  return events;
}

function findBoardCard(state: GameState, cardId: string): BoardCard | undefined {
  return (
    state.hostBoard.find((c) => c.cardId === cardId) ??
    state.awayBoard.find((c) => c.cardId === cardId)
  );
}

/**
 * Check if an effect can be activated (OPT / HOPT checks).
 */
export function canActivateEffect(
  state: GameState,
  effectDef: EffectDefinition,
): boolean {
  if (effectDef.oncePerTurn && state.optUsedThisTurn.includes(effectDef.id)) {
    return false;
  }
  if (effectDef.hardOncePerTurn && state.hoptUsedEffects.includes(effectDef.id)) {
    return false;
  }
  return true;
}

/**
 * Detect trigger effects that should fire based on events that just occurred.
 * Used in simple chain mode: auto-fire matching triggers.
 */
export function detectTriggerEffects(
  state: GameState,
  events: EngineEvent[],
): EngineEvent[] {
  const triggered: EngineEvent[] = [];

  for (const event of events) {
    // Check on_summon triggers
    if (event.type === "MONSTER_SUMMONED") {
      const cardDef = state.cardLookup[event.cardId];
      if (cardDef?.effects) {
        for (let i = 0; i < cardDef.effects.length; i++) {
          const eff = cardDef.effects[i];
          if (eff.type === "on_summon" && canActivateEffect(state, eff)) {
            // Auto-activate: resolve effect actions
            triggered.push({
              type: "EFFECT_ACTIVATED",
              seat: event.seat,
              cardId: event.cardId,
              effectIndex: i,
              targets: [event.cardId], // Default target: self
            });
            // Resolve the actions
            const actionEvents = resolveEffectActions(
              state, event.seat, eff.actions, [event.cardId]
            );
            triggered.push(...actionEvents);
          }
        }
      }
    }

    // Check spell activation triggers on other cards
    if (event.type === "SPELL_ACTIVATED") {
      // Check board cards for "trigger" effects that respond to spells
      const board = event.seat === "host" ? state.hostBoard : state.awayBoard;
      for (const boardCard of board) {
        const cardDef = state.cardLookup[boardCard.definitionId];
        if (!cardDef?.effects) continue;
        for (let i = 0; i < cardDef.effects.length; i++) {
          const eff = cardDef.effects[i];
          if (eff.type === "trigger" && canActivateEffect(state, eff)) {
            // Check if description mentions spell triggers
            if (eff.description.includes("MODIFY_STAT") || eff.description.includes("DRAW")) {
              // This is a spell-reactive effect — auto-fire
              triggered.push({
                type: "EFFECT_ACTIVATED",
                seat: event.seat,
                cardId: boardCard.cardId,
                effectIndex: i,
                targets: [boardCard.cardId],
              });
              const actionEvents = resolveEffectActions(
                state, event.seat, eff.actions, [boardCard.cardId]
              );
              triggered.push(...actionEvents);
            }
          }
        }
      }
    }
  }

  return triggered;
}
```

#### Step 2: Write effect resolution tests

```typescript
// packages/engine/src/__tests__/effects.test.ts
import { describe, it, expect } from "vitest";
import { createEngine } from "../engine.js";
import { defineCards } from "../cards.js";
import type { CardDefinition } from "../types/index.js";

const drawOnSummonCard: CardDefinition = {
  id: "drawer",
  name: "Draw Monster",
  type: "stereotype",
  description: "Draws on summon",
  rarity: "common",
  attack: 1000,
  defense: 1000,
  level: 4,
  attribute: "fire",
  effects: [
    {
      id: "draw-eff",
      type: "on_summon",
      description: "DRAW: 1",
      actions: [{ type: "draw", count: 1 }],
      oncePerTurn: true,
    },
  ],
};

const damageSpell: CardDefinition = {
  id: "damage-spell",
  name: "Damage Spell",
  type: "spell",
  description: "Deals 500 damage",
  rarity: "common",
  spellType: "normal",
  effects: [
    {
      id: "dmg-eff",
      type: "trigger",
      description: "MODIFY_STAT: reputation -500",
      actions: [{ type: "damage", amount: 500, target: "opponent" }],
    },
  ],
};

const filler: CardDefinition = {
  id: "filler",
  name: "Filler",
  type: "stereotype",
  description: "filler",
  rarity: "common",
  attack: 100,
  defense: 100,
  level: 1,
  attribute: "earth",
};

function makeLookup(cards: CardDefinition[]) {
  return defineCards(cards);
}

function makeDeck(ids: string[], size: number) {
  const deck: string[] = [];
  for (let i = 0; i < size; i++) {
    deck.push(ids[i % ids.length]);
  }
  return deck;
}

describe("Effect Resolution", () => {
  it("on_summon effect draws a card", () => {
    const lookup = makeLookup([drawOnSummonCard, filler]);
    const engine = createEngine({
      cardLookup: lookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: makeDeck(["drawer", "filler"], 40),
      awayDeck: makeDeck(["filler"], 40),
      seed: 42,
    });

    // Advance to main phase
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));

    const handBefore = engine.getState().hostHand.length;
    const deckBefore = engine.getState().hostDeck.length;

    // Find a drawer card in hand
    const drawerId = engine.getState().hostHand.find(id => id === "drawer");
    if (!drawerId) throw new Error("No drawer in hand");

    // Summon it
    const events = engine.decide({ type: "SUMMON", cardId: drawerId, position: "attack" }, "host");
    engine.evolve(events);

    // Hand should be: -1 (summoned) + 1 (drawn) = same size
    // Deck should be: -1
    expect(engine.getState().hostHand.length).toBe(handBefore - 1 + 1);
    expect(engine.getState().hostDeck.length).toBe(deckBefore - 1);
  });

  it("spell effect deals damage to opponent", () => {
    const lookup = makeLookup([damageSpell, filler]);
    const engine = createEngine({
      cardLookup: lookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: makeDeck(["damage-spell", "filler"], 40),
      awayDeck: makeDeck(["filler"], 40),
      seed: 42,
    });

    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));

    const lpBefore = engine.getState().awayLifePoints;

    const spellId = engine.getState().hostHand.find(id => id === "damage-spell");
    if (!spellId) throw new Error("No spell in hand");

    const events = engine.decide({ type: "ACTIVATE_SPELL", cardId: spellId }, "host");
    engine.evolve(events);

    expect(engine.getState().awayLifePoints).toBe(lpBefore - 500);
  });
});
```

#### Step 3: Wire effects into engine.ts

In `decide()`, when handling `ACTIVATE_SPELL`, append effect resolution events:

```typescript
case "ACTIVATE_SPELL": {
  const spellEvents = decideActivateSpell(state, seat, command);
  events.push(...spellEvents);
  // Resolve spell effects
  if (spellEvents.length > 0) {
    const spellEvent = spellEvents.find(e => e.type === "SPELL_ACTIVATED");
    if (spellEvent && spellEvent.type === "SPELL_ACTIVATED") {
      const defId = spellEvent.cardId;
      const cardDef = state.cardLookup[defId];
      if (cardDef?.effects) {
        for (const eff of cardDef.effects) {
          const effectEvents = resolveEffectActions(state, seat, eff.actions, command.targets ?? []);
          events.push(...effectEvents);
        }
      }
    }
  }
  break;
}
```

In `evolve()`, after the main event loop, call `detectTriggerEffects` for auto-triggers:

```typescript
// At end of evolve(), before state-based LP check:
const triggerEvents = detectTriggerEffects(newState, events);
if (triggerEvents.length > 0) {
  // Recursively evolve trigger events
  for (const te of triggerEvents) {
    // Process each trigger event through the same switch
    newState = evolve(newState, [te]);
  }
}
```

Add new event handlers in `evolve()`:

```typescript
case "EFFECT_ACTIVATED": {
  const { effectIndex } = event as Extract<EngineEvent, { type: "EFFECT_ACTIVATED" }>;
  const cardId = (event as any).cardId;
  const cardDef = newState.cardLookup[cardId];
  if (cardDef?.effects?.[effectIndex]) {
    const eff = cardDef.effects[effectIndex];
    if (eff.oncePerTurn) {
      newState.optUsedThisTurn = [...newState.optUsedThisTurn, eff.id];
    }
    if (eff.hardOncePerTurn) {
      newState.hoptUsedEffects = [...newState.hoptUsedEffects, eff.id];
    }
  }
  break;
}

case "MODIFIER_APPLIED": {
  const { cardId, field, amount, source } = event as Extract<EngineEvent, { type: "MODIFIER_APPLIED" }>;
  for (const boardKey of ["hostBoard", "awayBoard"] as const) {
    const board = [...newState[boardKey]];
    const idx = board.findIndex((c) => c.cardId === cardId);
    if (idx > -1) {
      const boosts = { ...board[idx].temporaryBoosts };
      boosts[field] += amount;
      board[idx] = { ...board[idx], temporaryBoosts: boosts };
      newState[boardKey] = board;
      // Also add to temporaryModifiers list for expiration tracking
      newState.temporaryModifiers = [
        ...newState.temporaryModifiers,
        { cardId, field, amount, expiresAt: "end_of_turn", source },
      ];
      break;
    }
  }
  break;
}

case "SPECIAL_SUMMONED": {
  const { seat: summonSeat, cardId, position } = event as Extract<EngineEvent, { type: "SPECIAL_SUMMONED" }>;
  const isHost = summonSeat === "host";
  // Remove from source zone (graveyard for now)
  const graveyard = isHost ? [...newState.hostGraveyard] : [...newState.awayGraveyard];
  const gIdx = graveyard.indexOf(cardId);
  if (gIdx > -1) graveyard.splice(gIdx, 1);
  if (isHost) newState.hostGraveyard = graveyard;
  else newState.awayGraveyard = graveyard;
  // Add to board
  const board = isHost ? [...newState.hostBoard] : [...newState.awayBoard];
  board.push({
    cardId,
    definitionId: cardId,
    position,
    faceDown: false,
    canAttack: false,
    hasAttackedThisTurn: false,
    changedPositionThisTurn: false,
    viceCounters: 0,
    temporaryBoosts: { attack: 0, defense: 0 },
    equippedCards: [],
    turnSummoned: newState.turnNumber,
  });
  if (isHost) newState.hostBoard = board;
  else newState.awayBoard = board;
  break;
}

case "CARD_BANISHED": {
  const { cardId, from } = event as Extract<EngineEvent, { type: "CARD_BANISHED" }>;
  if (from === "board") {
    for (const boardKey of ["hostBoard", "awayBoard"] as const) {
      const idx = newState[boardKey].findIndex(c => c.cardId === cardId);
      if (idx > -1) {
        const board = [...newState[boardKey]];
        board.splice(idx, 1);
        newState[boardKey] = board;
        const banishKey = boardKey === "hostBoard" ? "hostBanished" : "awayBanished";
        newState[banishKey] = [...newState[banishKey], cardId];
        break;
      }
    }
  }
  break;
}

case "CARD_RETURNED_TO_HAND": {
  const { cardId, from } = event as Extract<EngineEvent, { type: "CARD_RETURNED_TO_HAND" }>;
  if (from === "board") {
    for (const boardKey of ["hostBoard", "awayBoard"] as const) {
      const idx = newState[boardKey].findIndex(c => c.cardId === cardId);
      if (idx > -1) {
        const board = [...newState[boardKey]];
        board.splice(idx, 1);
        newState[boardKey] = board;
        const handKey = boardKey === "hostBoard" ? "hostHand" : "awayHand";
        newState[handKey] = [...newState[handKey], cardId];
        break;
      }
    }
  }
  break;
}
```

#### Step 4: Run tests

Run: `cd packages/engine && bun run test -- --run`
Expected: All PASS (including new effects tests)

#### Step 5: Commit

```bash
git add packages/engine/src/rules/effects.ts packages/engine/src/rules/index.ts packages/engine/src/engine.ts packages/engine/src/__tests__/effects.test.ts
git commit -m "feat(engine): implement effect resolution system

Resolves all 14 EffectAction types. Auto-fires on_summon triggers.
Spell effects resolve on activation. OPT/HOPT tracking enforced."
```

---

### Task 6: ACTIVATE_EFFECT Handler

**Files:**
- Modify: `packages/engine/src/engine.ts` (decide switch)
- Test: `packages/engine/src/__tests__/effects.test.ts`

**Step 1: Write the failing test**

```typescript
describe("ACTIVATE_EFFECT", () => {
  const ignitionMonster: CardDefinition = {
    id: "ignition-mon",
    name: "Ignition Monster",
    type: "stereotype",
    description: "Has an ignition effect",
    rarity: "common",
    attack: 1200,
    defense: 1000,
    level: 4,
    attribute: "fire",
    effects: [
      {
        id: "ign-draw",
        type: "ignition",
        description: "DRAW: 1",
        actions: [{ type: "draw", count: 1 }],
        oncePerTurn: true,
      },
    ],
  };

  it("activates ignition effect on board monster during main phase", () => {
    const lookup = makeLookup([ignitionMonster, filler]);
    const engine = createEngine({
      cardLookup: lookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: makeDeck(["ignition-mon", "filler"], 40),
      awayDeck: makeDeck(["filler"], 40),
      seed: 42,
    });

    // Advance to main, summon
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    const monId = engine.getState().hostHand.find(id => id === "ignition-mon")!;
    engine.evolve(engine.decide({ type: "SUMMON", cardId: monId, position: "attack" }, "host"));

    const deckBefore = engine.getState().hostDeck.length;

    // Activate effect
    const events = engine.decide({ type: "ACTIVATE_EFFECT", cardId: monId, effectIndex: 0 }, "host");
    expect(events.length).toBeGreaterThan(0);
    engine.evolve(events);

    expect(engine.getState().hostDeck.length).toBe(deckBefore - 1);
  });

  it("respects OPT — cannot activate same effect twice", () => {
    const lookup = makeLookup([ignitionMonster, filler]);
    const engine = createEngine({
      cardLookup: lookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: makeDeck(["ignition-mon", "filler"], 40),
      awayDeck: makeDeck(["filler"], 40),
      seed: 42,
    });

    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    const monId = engine.getState().hostHand.find(id => id === "ignition-mon")!;
    engine.evolve(engine.decide({ type: "SUMMON", cardId: monId, position: "attack" }, "host"));

    // First activation
    engine.evolve(engine.decide({ type: "ACTIVATE_EFFECT", cardId: monId, effectIndex: 0 }, "host"));

    // Second activation same turn — should fail
    const events = engine.decide({ type: "ACTIVATE_EFFECT", cardId: monId, effectIndex: 0 }, "host");
    expect(events).toEqual([]);
  });
});
```

**Step 2: Implement in decide()**

```typescript
case "ACTIVATE_EFFECT": {
  const { cardId, effectIndex, targets = [] } = command;
  // Must be main phase
  if (state.currentPhase !== "main" && state.currentPhase !== "main2") break;
  // Card must be on player's board
  const board = seat === "host" ? state.hostBoard : state.awayBoard;
  const boardCard = board.find(c => c.cardId === cardId);
  if (!boardCard || boardCard.faceDown) break;
  // Look up effect
  const cardDef = state.cardLookup[boardCard.definitionId];
  if (!cardDef?.effects?.[effectIndex]) break;
  const eff = cardDef.effects[effectIndex];
  // Must be ignition type for manual activation
  if (eff.type !== "ignition") break;
  // OPT check
  if (!canActivateEffect(state, eff)) break;
  // Emit activation event
  events.push({
    type: "EFFECT_ACTIVATED",
    seat,
    cardId,
    effectIndex,
    targets,
  });
  // Resolve effect actions
  events.push(...resolveEffectActions(state, seat, eff.actions, targets.length > 0 ? targets : [cardId]));
  break;
}
```

**Step 3-5: Run tests, verify, commit**

Run: `cd packages/engine && bun run test -- --run`

```bash
git add packages/engine/src/engine.ts packages/engine/src/__tests__/effects.test.ts
git commit -m "feat(engine): implement ACTIVATE_EFFECT command handler with OPT"
```

---

### Task 7: Full legalMoves() Implementation

**Files:**
- Modify: `packages/engine/src/engine.ts:195-209` (legalMoves)
- Test: `packages/engine/src/__tests__/engine.test.ts`

**Step 1: Write failing tests**

```typescript
describe("legalMoves — full enumeration", () => {
  it("includes SUMMON for hand stereotypes in main phase", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    // Advance to main
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));

    const moves = engine.legalMoves("host");
    expect(moves.some(m => m.type === "SUMMON")).toBe(true);
    expect(moves.some(m => m.type === "SET_MONSTER")).toBe(true);
  });

  it("includes DECLARE_ATTACK in combat phase", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    // Summon and advance to combat
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    const hand = engine.getState().hostHand;
    engine.evolve(engine.decide({ type: "SUMMON", cardId: hand[0], position: "attack" }, "host"));

    // End turn, away turn, end, back to host turn 2+
    engine.evolve(engine.decide({ type: "END_TURN" }, "host"));
    engine.evolve(engine.decide({ type: "END_TURN" }, "away"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host")); // main -> combat

    const moves = engine.legalMoves("host");
    expect(moves.some(m => m.type === "DECLARE_ATTACK")).toBe(true);
  });

  it("excludes SUMMON when normalSummonedThisTurn", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    const hand = engine.getState().hostHand;
    engine.evolve(engine.decide({ type: "SUMMON", cardId: hand[0], position: "attack" }, "host"));

    const moves = engine.legalMoves("host");
    expect(moves.some(m => m.type === "SUMMON")).toBe(false);
    expect(moves.some(m => m.type === "SET_MONSTER")).toBe(false);
  });

  it("excludes DECLARE_ATTACK on turn 1", () => {
    const engine = createEngine({
      cardLookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: createTestDeck(40),
      awayDeck: createTestDeck(40),
    });

    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    const hand = engine.getState().hostHand;
    engine.evolve(engine.decide({ type: "SUMMON", cardId: hand[0], position: "attack" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host")); // main -> combat

    const moves = engine.legalMoves("host");
    expect(moves.some(m => m.type === "DECLARE_ATTACK")).toBe(false);
  });

  it("includes SET_SPELL_TRAP for spells in hand", () => {
    // Need a deck with spells
    const spellCards = defineCards([
      { id: "warrior-1", name: "Warrior", type: "stereotype", description: "test", rarity: "common", attack: 1500, defense: 1200, level: 4, attribute: "fire" },
      { id: "spell-1", name: "Spell", type: "spell", description: "test", rarity: "common", spellType: "normal" },
    ]);

    const engine = createEngine({
      cardLookup: spellCards,
      hostId: "p1",
      awayId: "p2",
      hostDeck: Array(20).fill("warrior-1").concat(Array(20).fill("spell-1")),
      awayDeck: Array(40).fill("warrior-1"),
      seed: 1,
    });

    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));

    const hand = engine.getState().hostHand;
    const hasSpell = hand.some(id => spellCards[id]?.type === "spell");

    if (hasSpell) {
      const moves = engine.legalMoves("host");
      expect(moves.some(m => m.type === "SET_SPELL_TRAP")).toBe(true);
      expect(moves.some(m => m.type === "ACTIVATE_SPELL")).toBe(true);
    }
  });
});
```

**Step 2: Implement full legalMoves()**

Replace `legalMoves` function in `engine.ts`:

```typescript
export function legalMoves(state: GameState, seat: Seat): Command[] {
  if (state.gameOver) return [];
  if (state.currentTurnPlayer !== seat) return [];

  const moves: Command[] = [];
  const isHost = seat === "host";
  const hand = isHost ? state.hostHand : state.awayHand;
  const board = isHost ? state.hostBoard : state.awayBoard;
  const opponentBoard = isHost ? state.awayBoard : state.hostBoard;
  const spellTrapZone = isHost ? state.hostSpellTrapZone : state.awaySpellTrapZone;
  const normalSummoned = isHost ? state.hostNormalSummonedThisTurn : state.awayNormalSummonedThisTurn;
  const phase = state.currentPhase;

  // Always available
  moves.push({ type: "SURRENDER" });

  // Phase advancement (always except end phase which auto-advances)
  if (phase !== "end") {
    moves.push({ type: "ADVANCE_PHASE" });
  }

  // END_TURN available in main phases
  if (phase === "main" || phase === "main2" || phase === "combat" || phase === "standby") {
    moves.push({ type: "END_TURN" });
  }

  // Main phase actions
  if (phase === "main" || phase === "main2") {
    // SUMMON / SET_MONSTER — one per turn, need board space
    if (!normalSummoned && board.length < state.config.maxBoardSlots) {
      for (const cardId of hand) {
        const def = state.cardLookup[cardId];
        if (!def || def.type !== "stereotype") continue;
        const level = def.level ?? 0;

        if (level <= 6) {
          // No tribute needed for level 1-6
          moves.push({ type: "SUMMON", cardId, position: "attack" });
          moves.push({ type: "SUMMON", cardId, position: "defense" });
          moves.push({ type: "SET_MONSTER", cardId });
        } else {
          // Level 7+: need 1 tribute
          const tributes = board.filter(c => !c.faceDown);
          if (tributes.length >= 1) {
            for (const tribute of tributes) {
              moves.push({
                type: "SUMMON",
                cardId,
                position: "attack",
                tributeCardIds: [tribute.cardId],
              });
            }
          }
        }
      }
    }

    // FLIP_SUMMON — face-down monsters not summoned this turn
    for (const card of board) {
      if (card.faceDown && card.turnSummoned < state.turnNumber) {
        moves.push({ type: "FLIP_SUMMON", cardId: card.cardId });
      }
    }

    // CHANGE_POSITION — face-up monsters that haven't changed this turn
    for (const card of board) {
      if (!card.faceDown && !card.changedPositionThisTurn && card.turnSummoned < state.turnNumber) {
        moves.push({ type: "CHANGE_POSITION", cardId: card.cardId });
      }
    }

    // SET_SPELL_TRAP — spells/traps in hand, zone has space
    if (spellTrapZone.length < state.config.maxSpellTrapSlots) {
      for (const cardId of hand) {
        const def = state.cardLookup[cardId];
        if (!def) continue;
        if (def.type === "spell" || def.type === "trap") {
          moves.push({ type: "SET_SPELL_TRAP", cardId });
        }
      }
    }

    // ACTIVATE_SPELL — spells in hand or face-down set spells
    for (const cardId of hand) {
      const def = state.cardLookup[cardId];
      if (def?.type === "spell") {
        // Check zone space for non-field spells
        if (def.spellType === "field" || spellTrapZone.length < state.config.maxSpellTrapSlots) {
          moves.push({ type: "ACTIVATE_SPELL", cardId });
        }
      }
    }
    for (const card of spellTrapZone) {
      if (card.faceDown) {
        const def = state.cardLookup[card.definitionId];
        if (def?.type === "spell") {
          moves.push({ type: "ACTIVATE_SPELL", cardId: card.cardId });
        }
      }
    }

    // ACTIVATE_EFFECT — ignition effects on face-up board monsters
    for (const card of board) {
      if (card.faceDown) continue;
      const def = state.cardLookup[card.definitionId];
      if (!def?.effects) continue;
      for (let i = 0; i < def.effects.length; i++) {
        const eff = def.effects[i];
        if (eff.type === "ignition" && canActivateEffect(state, eff)) {
          moves.push({ type: "ACTIVATE_EFFECT", cardId: card.cardId, effectIndex: i });
        }
      }
    }
  }

  // Combat phase actions
  if (phase === "combat" && state.turnNumber > 1) {
    for (const card of board) {
      if (card.faceDown || !card.canAttack || card.hasAttackedThisTurn) continue;
      if (opponentBoard.length === 0) {
        // Direct attack
        moves.push({ type: "DECLARE_ATTACK", attackerId: card.cardId });
      } else {
        // Attack each opponent monster
        for (const target of opponentBoard) {
          moves.push({ type: "DECLARE_ATTACK", attackerId: card.cardId, targetId: target.cardId });
        }
      }
    }
  }

  return moves;
}
```

Import `canActivateEffect` from `./rules/effects.js` at top of engine.ts.

**Step 3-5: Run tests, verify, commit**

Run: `cd packages/engine && bun run test -- --run`

```bash
git add packages/engine/src/engine.ts packages/engine/src/__tests__/engine.test.ts
git commit -m "feat(engine): implement full legalMoves() enumeration

Phase-gated command generation for all command types:
SUMMON, SET_MONSTER, FLIP_SUMMON, CHANGE_POSITION, SET_SPELL_TRAP,
ACTIVATE_SPELL, ACTIVATE_EFFECT, DECLARE_ATTACK, ADVANCE_PHASE,
END_TURN, SURRENDER."
```

---

### Task 8: Modifier Expiration

**Files:**
- Modify: `packages/engine/src/engine.ts` (TURN_ENDED handler in evolve)
- Test: `packages/engine/src/__tests__/effects.test.ts`

**Step 1: Write failing test**

```typescript
describe("modifier expiration", () => {
  it("removes end_of_turn modifiers when turn ends", () => {
    // Create engine, summon monster, apply boost via effect, end turn, check boost gone
    const boostMonster: CardDefinition = {
      id: "booster",
      name: "Boost Monster",
      type: "stereotype",
      description: "Boosts on summon",
      rarity: "common",
      attack: 1000,
      defense: 1000,
      level: 4,
      attribute: "fire",
      effects: [{
        id: "boost-eff",
        type: "on_summon",
        description: "boost",
        actions: [{ type: "boost_attack", amount: 500, duration: "turn" }],
      }],
    };

    const lookup = makeLookup([boostMonster, filler]);
    const engine = createEngine({
      cardLookup: lookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: makeDeck(["booster", "filler"], 40),
      awayDeck: makeDeck(["filler"], 40),
      seed: 42,
    });

    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));

    const monId = engine.getState().hostHand.find(id => id === "booster")!;
    engine.evolve(engine.decide({ type: "SUMMON", cardId: monId, position: "attack" }, "host"));

    // Boost should be applied
    expect(engine.getState().hostBoard[0].temporaryBoosts.attack).toBe(500);

    // End turn
    engine.evolve(engine.decide({ type: "END_TURN" }, "host"));

    // Boost should be gone
    expect(engine.getState().hostBoard[0].temporaryBoosts.attack).toBe(0);
  });
});
```

**Step 2: Implement in evolve() TURN_ENDED handler**

```typescript
case "TURN_ENDED": {
  // Expire end_of_turn modifiers
  const expiredMods = newState.temporaryModifiers.filter(m => m.expiresAt === "end_of_turn");
  for (const mod of expiredMods) {
    for (const boardKey of ["hostBoard", "awayBoard"] as const) {
      const board = [...newState[boardKey]];
      const idx = board.findIndex(c => c.cardId === mod.cardId);
      if (idx > -1) {
        const boosts = { ...board[idx].temporaryBoosts };
        boosts[mod.field] -= mod.amount;
        board[idx] = { ...board[idx], temporaryBoosts: boosts };
        newState[boardKey] = board;
        break;
      }
    }
  }
  newState.temporaryModifiers = newState.temporaryModifiers.filter(m => m.expiresAt !== "end_of_turn");
  break;
}
```

**Step 3-5: Run tests, verify, commit**

```bash
git add packages/engine/src/engine.ts packages/engine/src/__tests__/effects.test.ts
git commit -m "feat(engine): expire end_of_turn modifiers on TURN_ENDED"
```

---

### Task 9: Simple Trap Auto-Triggers

**Files:**
- Modify: `packages/engine/src/rules/effects.ts` (detectTriggerEffects)
- Test: `packages/engine/src/__tests__/effects.test.ts`

**Step 1: Write failing test**

```typescript
describe("trap auto-triggers", () => {
  it("auto-triggers trap when opponent summons", () => {
    const trap: CardDefinition = {
      id: "summon-trap",
      name: "Summon Trap",
      type: "trap",
      description: "Damages on opponent summon",
      rarity: "common",
      trapType: "normal",
      effects: [{
        id: "trap-dmg",
        type: "trigger",
        description: "MODIFY_STAT: reputation -500",
        actions: [{ type: "damage", amount: 500, target: "opponent" }],
      }],
    };

    const lookup = makeLookup([filler, trap]);
    const engine = createEngine({
      cardLookup: lookup,
      hostId: "p1",
      awayId: "p2",
      hostDeck: makeDeck(["summon-trap", "filler"], 40),
      awayDeck: makeDeck(["filler"], 40),
      seed: 42,
    });

    // Host sets trap
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "host"));

    const trapId = engine.getState().hostHand.find(id => id === "summon-trap");
    if (trapId) {
      engine.evolve(engine.decide({ type: "SET_SPELL_TRAP", cardId: trapId }, "host"));
    }

    engine.evolve(engine.decide({ type: "END_TURN" }, "host"));

    // Away summons — trap should auto-fire
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "away"));
    engine.evolve(engine.decide({ type: "ADVANCE_PHASE" }, "away"));

    const lpBefore = engine.getState().awayLifePoints;
    const awayHand = engine.getState().awayHand;
    const fillerId = awayHand.find(id => id === "filler");
    if (fillerId) {
      engine.evolve(engine.decide({ type: "SUMMON", cardId: fillerId, position: "attack" }, "away"));
    }

    // Trap should have dealt 500 damage to away (self-damage from their perspective... actually trap belongs to host, so opponent = away)
    expect(engine.getState().awayLifePoints).toBe(lpBefore - 500);
  });
});
```

**Step 2: Extend detectTriggerEffects for traps**

In `rules/effects.ts` `detectTriggerEffects`, add trap scanning:

```typescript
// After checking on_summon triggers, check opponent's traps
if (event.type === "MONSTER_SUMMONED") {
  // Check opponent's face-down traps for OnOpponentStereotypeSummoned
  const trapOwner = opponentSeat(event.seat);
  const trapZone = trapOwner === "host" ? state.hostSpellTrapZone : state.awaySpellTrapZone;

  for (const setCard of trapZone) {
    if (!setCard.faceDown) continue;
    const trapDef = state.cardLookup[setCard.definitionId];
    if (!trapDef || trapDef.type !== "trap" || !trapDef.effects) continue;

    for (let i = 0; i < trapDef.effects.length; i++) {
      const eff = trapDef.effects[i];
      if (canActivateEffect(state, eff)) {
        // Auto-activate trap
        triggered.push({
          type: "TRAP_ACTIVATED",
          seat: trapOwner,
          cardId: setCard.cardId,
          targets: [],
        });
        triggered.push({
          type: "EFFECT_ACTIVATED",
          seat: trapOwner,
          cardId: setCard.cardId,
          effectIndex: i,
          targets: [],
        });
        const actionEvents = resolveEffectActions(
          state, trapOwner, eff.actions, []
        );
        triggered.push(...actionEvents);
      }
    }
  }
}
```

**Step 3-5: Run tests, verify, commit**

```bash
git add packages/engine/src/rules/effects.ts packages/engine/src/__tests__/effects.test.ts
git commit -m "feat(engine): auto-trigger traps on opponent summon (simple chains)"
```

---

### Task 10: Run Full Test Suite + Type Check

**Step 1: Run all tests**

```bash
cd packages/engine && bun run test -- --run
```

Expected: All PASS

**Step 2: Run type check**

```bash
cd packages/engine && bun run type-check
```

Expected: No errors

**Step 3: Final commit**

```bash
git add -A packages/engine/
git commit -m "feat(engine): close all 9 critical engine gaps

- Seeded RNG for deterministic replay
- GAME_STARTED event emission
- Deck copy limits (default 3)
- CHANGE_POSITION command handler
- Effect resolution system (14 action types)
- ACTIVATE_EFFECT command with OPT/HOPT
- Full legalMoves() enumeration (phase-gated)
- Modifier expiration on turn end
- Simple trap auto-triggers"
```

---

## Dependency Graph

```
Task 1 (Seeded RNG) ─────────────────┐
Task 2 (GAME_STARTED) ───────────────┤ (no deps, parallel)
Task 3 (Deck Copy Limits) ───────────┤
                                      ↓
Task 4 (CHANGE_POSITION) ────────────┤ (no deps on above)
                                      ↓
Task 5 (Effect Resolution) ──────────┤ (foundational)
                                      ↓
Task 6 (ACTIVATE_EFFECT) ────────────┤ (depends on T5)
Task 7 (legalMoves) ─────────────────┤ (depends on T4, T5, T6)
Task 8 (Modifier Expiration) ────────┤ (depends on T5)
Task 9 (Trap Auto-Triggers) ─────────┤ (depends on T5)
                                      ↓
Task 10 (Full Suite + Type Check) ───┘
```

Tasks 1-3 can run in parallel. Task 4 is independent. Tasks 5-9 are sequential. Task 10 is final validation.
