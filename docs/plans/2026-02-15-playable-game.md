# Playable Game Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make LunchTable TCG fully playable — interactive game board for humans, card effect system, chain/priority, AI opponent, graveyard browsers.

**Architecture:** Frontend sends JSON-serialized `Command` objects via `submitAction` mutation → engine `decide()` → `evolve()` → snapshot persisted. PlayerView returned as JSON string via reactive Convex query. AI opponent uses scheduled internal mutation with heuristic command selection.

**Tech Stack:** React 19 + Framer Motion (frontend), Convex (backend), pure TS engine (game logic), Vitest (tests)

---

## Workstream 1: Engine — legalMoves()

### Task 1: Implement legalMoves() in engine

**Files:**
- Modify: `packages/engine/src/engine.ts` — replace stub `legalMoves()` function
- Test: `packages/engine/src/__tests__/engine.test.ts`

**Step 1: Write failing tests**

Add to `packages/engine/src/__tests__/engine.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createInitialState, legalMoves, decide, evolve } from "../engine.js";
import { DEFAULT_CONFIG } from "../types/config.js";

function makeCardLookup() {
  return {
    "m1": { name: "M1", type: "stereotype", cardType: "stereotype", level: 4, attack: 1500, defense: 1000, rarity: "common", archetype: "dropouts" },
    "m2": { name: "M2", type: "stereotype", cardType: "stereotype", level: 4, attack: 1200, defense: 800, rarity: "common", archetype: "dropouts" },
    "m7": { name: "M7", type: "stereotype", cardType: "stereotype", level: 7, attack: 2500, defense: 2000, rarity: "rare", archetype: "dropouts" },
    "s1": { name: "S1", type: "spell", cardType: "spell", spellType: "normal", rarity: "common", archetype: "dropouts" },
    "t1": { name: "T1", type: "trap", cardType: "trap", trapType: "normal", rarity: "common", archetype: "dropouts" },
  } as any;
}

function makeState(overrides: any = {}) {
  const lookup = makeCardLookup();
  const hostDeck = Array(35).fill("m1");
  const awayDeck = Array(35).fill("m2");
  const state = createInitialState(lookup, DEFAULT_CONFIG, "host1", "away1", hostDeck, awayDeck, "host");
  return { ...state, ...overrides, cardLookup: lookup };
}

describe("legalMoves", () => {
  it("returns empty when game is over", () => {
    const state = makeState({ gameOver: true });
    expect(legalMoves(state, "host")).toEqual([]);
  });

  it("returns empty when not your turn", () => {
    const state = makeState({ currentTurnPlayer: "away" });
    expect(legalMoves(state, "host")).toEqual([]);
  });

  it("always includes ADVANCE_PHASE, END_TURN, SURRENDER", () => {
    const state = makeState({ currentPhase: "main" });
    const moves = legalMoves(state, "host");
    expect(moves.some(m => m.type === "ADVANCE_PHASE")).toBe(true);
    expect(moves.some(m => m.type === "END_TURN")).toBe(true);
    expect(moves.some(m => m.type === "SURRENDER")).toBe(true);
  });

  it("includes SUMMON for hand monsters during main phase", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      hostNormalSummonedThisTurn: false,
      hostHand: ["m1", "s1"],
    });
    const moves = legalMoves(state, "host");
    const summons = moves.filter(m => m.type === "SUMMON");
    expect(summons.length).toBeGreaterThan(0);
    expect(summons[0].cardId).toBe("m1");
  });

  it("includes SET_MONSTER for hand monsters during main phase", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      hostNormalSummonedThisTurn: false,
      hostHand: ["m1"],
    });
    const moves = legalMoves(state, "host");
    expect(moves.some(m => m.type === "SET_MONSTER")).toBe(true);
  });

  it("excludes summon moves if already summoned this turn", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      hostNormalSummonedThisTurn: true,
      hostHand: ["m1"],
    });
    const moves = legalMoves(state, "host");
    expect(moves.filter(m => m.type === "SUMMON").length).toBe(0);
    expect(moves.filter(m => m.type === "SET_MONSTER").length).toBe(0);
  });

  it("includes DECLARE_ATTACK during combat phase for eligible monsters", () => {
    const state = makeState({
      currentPhase: "combat",
      currentTurnPlayer: "host",
      turnNumber: 2,
      hostBoard: [{
        cardId: "m1", definitionId: "m1", position: "attack", faceDown: false,
        canAttack: true, hasAttackedThisTurn: false, changedPositionThisTurn: false,
        viceCounters: 0, temporaryBoosts: { attack: 0, defense: 0 }, equippedCards: [], turnSummoned: 1,
      }],
      awayBoard: [],
    });
    const moves = legalMoves(state, "host");
    const attacks = moves.filter(m => m.type === "DECLARE_ATTACK");
    expect(attacks.length).toBeGreaterThan(0);
  });

  it("includes SET_SPELL_TRAP for spells/traps in hand during main phase", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      hostHand: ["s1", "t1"],
      hostSpellTrapZone: [],
    });
    const moves = legalMoves(state, "host");
    const sets = moves.filter(m => m.type === "SET_SPELL_TRAP");
    expect(sets.length).toBe(2);
  });

  it("includes FLIP_SUMMON for face-down monsters set on previous turn", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      turnNumber: 3,
      hostBoard: [{
        cardId: "m1", definitionId: "m1", position: "defense", faceDown: true,
        canAttack: false, hasAttackedThisTurn: false, changedPositionThisTurn: false,
        viceCounters: 0, temporaryBoosts: { attack: 0, defense: 0 }, equippedCards: [], turnSummoned: 1,
      }],
    });
    const moves = legalMoves(state, "host");
    expect(moves.some(m => m.type === "FLIP_SUMMON")).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/engine && bun run test -- --reporter=verbose src/__tests__/engine.test.ts`
Expected: Multiple FAIL (legalMoves returns only 3 hardcoded commands)

**Step 3: Implement legalMoves()**

Replace the `legalMoves` function in `packages/engine/src/engine.ts`:

```typescript
export function legalMoves(state: GameState, seat: Seat): Command[] {
  if (state.gameOver) return [];
  if (state.currentTurnPlayer !== seat) return [];

  const moves: Command[] = [];
  const isHost = seat === "host";

  const hand = isHost ? state.hostHand : state.awayHand;
  const board = isHost ? state.hostBoard : state.awayBoard;
  const spellTrapZone = isHost ? state.hostSpellTrapZone : state.awaySpellTrapZone;
  const normalSummoned = isHost ? state.hostNormalSummonedThisTurn : state.awayNormalSummonedThisTurn;
  const opponentBoard = isHost ? state.awayBoard : state.hostBoard;

  // Always available
  moves.push({ type: "ADVANCE_PHASE" });
  moves.push({ type: "END_TURN" });
  moves.push({ type: "SURRENDER" });

  const isMainPhase = state.currentPhase === "main" || state.currentPhase === "main2";

  // Main phase actions
  if (isMainPhase) {
    // Summon / Set monsters from hand
    if (!normalSummoned && board.length < state.config.maxBoardSlots) {
      for (const cardId of hand) {
        const card = state.cardLookup[cardId];
        if (!card || card.type !== "stereotype") continue;
        const level = card.level ?? 0;

        if (level < 7) {
          // No tribute needed
          moves.push({ type: "SUMMON", cardId, position: "attack" });
          moves.push({ type: "SUMMON", cardId, position: "defense" });
          moves.push({ type: "SET_MONSTER", cardId });
        } else {
          // Needs 1 tribute — check if we have face-up monsters to tribute
          const tributes = board.filter(c => !c.faceDown);
          for (const tribute of tributes) {
            moves.push({ type: "SUMMON", cardId, position: "attack", tributeCardIds: [tribute.cardId] });
            moves.push({ type: "SUMMON", cardId, position: "defense", tributeCardIds: [tribute.cardId] });
          }
        }
      }
    }

    // Set spells/traps from hand
    if (spellTrapZone.length < state.config.maxSpellTrapSlots) {
      for (const cardId of hand) {
        const card = state.cardLookup[cardId];
        if (!card || (card.type !== "spell" && card.type !== "trap")) continue;
        moves.push({ type: "SET_SPELL_TRAP", cardId });
      }
    }

    // Activate spells from hand
    for (const cardId of hand) {
      const card = state.cardLookup[cardId];
      if (!card || card.type !== "spell") continue;
      moves.push({ type: "ACTIVATE_SPELL", cardId });
    }

    // Activate set spells/traps
    for (const stCard of spellTrapZone) {
      if (!stCard.faceDown) continue;
      const card = state.cardLookup[stCard.definitionId];
      if (!card) continue;
      if (card.type === "spell") {
        moves.push({ type: "ACTIVATE_SPELL", cardId: stCard.cardId });
      } else if (card.type === "trap") {
        moves.push({ type: "ACTIVATE_TRAP", cardId: stCard.cardId });
      }
    }

    // Flip summon face-down monsters (set on a previous turn)
    for (const boardCard of board) {
      if (boardCard.faceDown && boardCard.turnSummoned < state.turnNumber) {
        moves.push({ type: "FLIP_SUMMON", cardId: boardCard.cardId });
      }
    }
  }

  // Combat phase actions
  if (state.currentPhase === "combat" && state.turnNumber > 1) {
    for (const mon of board) {
      if (mon.faceDown || !mon.canAttack || mon.hasAttackedThisTurn) continue;

      // Attack each opponent monster
      for (const target of opponentBoard) {
        moves.push({ type: "DECLARE_ATTACK", attackerId: mon.cardId, targetId: target.cardId });
      }

      // Direct attack if opponent has no face-up monsters
      const faceUpOpponents = opponentBoard.filter(c => !c.faceDown);
      if (faceUpOpponents.length === 0) {
        moves.push({ type: "DECLARE_ATTACK", attackerId: mon.cardId });
      }
    }
  }

  return moves;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/engine && bun run test -- --reporter=verbose src/__tests__/engine.test.ts`
Expected: All PASS

**Step 5: Build engine**

Run: `cd packages/engine && bun run build`

**Step 6: Commit**

```bash
git add packages/engine/src/engine.ts packages/engine/src/__tests__/engine.test.ts
git commit -m "feat(engine): implement legalMoves() with phase-specific actions"
```

---

## Workstream 2: Engine — Card Effect Interpreter

### Task 2: Create effect interpreter and operation handlers

**Files:**
- Create: `packages/engine/src/effects/interpreter.ts`
- Create: `packages/engine/src/effects/operations.ts`
- Test: `packages/engine/src/__tests__/effects.test.ts`

**Step 1: Create operation handlers**

Create `packages/engine/src/effects/operations.ts`:

```typescript
import type { GameState, Seat, EngineEvent, BoardCard } from "../types/index.js";
import { opponentSeat } from "../rules/phases.js";

/**
 * Parse an operation string like "DESTROY: target" or "MODIFY_STAT: reputation +300"
 * and generate the appropriate engine events.
 */
export function executeOperation(
  state: GameState,
  operation: string,
  activatingPlayer: Seat,
  sourceCardId: string,
  targets: string[],
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const [opCode, ...rest] = operation.split(":").map(s => s.trim());

  switch (opCode) {
    case "DESTROY": {
      const what = rest.join(":").trim();
      if (what === "target" || what === "targetStereotype") {
        for (const targetId of targets) {
          events.push({ type: "CARD_DESTROYED", cardId: targetId, reason: "effect" });
          events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId: targetId, from: "board" });
        }
      } else if (what === "alliedStereotypes") {
        const board = activatingPlayer === "host" ? state.hostBoard : state.awayBoard;
        for (const card of board) {
          if (card.cardId !== sourceCardId) {
            events.push({ type: "CARD_DESTROYED", cardId: card.cardId, reason: "effect" });
            events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId: card.cardId, from: "board" });
          }
        }
      }
      break;
    }

    case "MODIFY_STAT": {
      const statStr = rest.join(":").trim();
      // Parse "reputation +300" or "stability -200"
      const match = statStr.match(/(reputation|stability|attack|defense)\s*([+-]\d+)/);
      if (match) {
        const field = match[1] === "reputation" || match[1] === "attack" ? "attack" : "defense";
        const amount = parseInt(match[2], 10);
        // Apply to source card or targets
        const applyTo = targets.length > 0 ? targets : [sourceCardId];
        for (const cardId of applyTo) {
          events.push({ type: "MODIFIER_APPLIED", cardId, field, amount, source: sourceCardId });
        }
      }
      break;
    }

    case "DRAW": {
      const count = parseInt(rest.join("").trim(), 10) || 1;
      const deck = activatingPlayer === "host" ? state.hostDeck : state.awayDeck;
      for (let i = 0; i < Math.min(count, deck.length); i++) {
        events.push({ type: "CARD_DRAWN", seat: activatingPlayer, cardId: deck[i] });
      }
      break;
    }

    case "DAMAGE": {
      const amount = parseInt(rest.join("").trim(), 10) || 0;
      if (amount > 0) {
        events.push({ type: "DAMAGE_DEALT", seat: opponentSeat(activatingPlayer), amount, isBattle: false });
      }
      break;
    }

    case "HEAL": {
      const amount = parseInt(rest.join("").trim(), 10) || 0;
      if (amount > 0) {
        events.push({ type: "DAMAGE_DEALT", seat: activatingPlayer, amount: -amount, isBattle: false });
      }
      break;
    }

    case "ADD_VICE": {
      const count = parseInt(rest.join("").trim(), 10) || 1;
      for (const targetId of targets) {
        const card = findBoardCard(state, targetId);
        if (card) {
          events.push({ type: "VICE_COUNTER_ADDED", cardId: targetId, newCount: card.viceCounters + count });
        }
      }
      break;
    }

    case "REMOVE_VICE": {
      const count = parseInt(rest.join("").trim(), 10) || 1;
      for (const targetId of targets) {
        const card = findBoardCard(state, targetId);
        if (card) {
          events.push({ type: "VICE_COUNTER_REMOVED", cardId: targetId, newCount: Math.max(0, card.viceCounters - count) });
        }
      }
      break;
    }

    case "BANISH": {
      for (const targetId of targets) {
        events.push({ type: "CARD_BANISHED", cardId: targetId, from: "board" });
      }
      break;
    }

    case "RETURN_TO_HAND": {
      for (const targetId of targets) {
        events.push({ type: "CARD_RETURNED_TO_HAND", cardId: targetId, from: "board" });
      }
      break;
    }

    default:
      // Unknown operation — skip silently for forward compatibility
      break;
  }

  return events;
}

function findBoardCard(state: GameState, cardId: string): BoardCard | undefined {
  return state.hostBoard.find(c => c.cardId === cardId)
    ?? state.awayBoard.find(c => c.cardId === cardId);
}
```

**Step 2: Create interpreter**

Create `packages/engine/src/effects/interpreter.ts`:

```typescript
import type { GameState, Seat, EngineEvent } from "../types/index.js";
import type { CardDefinition } from "../types/cards.js";
import { executeOperation } from "./operations.js";

/**
 * Execute a card's ability by index, generating engine events.
 * Returns empty array if card/ability not found.
 */
export function executeEffect(
  state: GameState,
  cardDefinition: CardDefinition,
  abilityIndex: number,
  activatingPlayer: Seat,
  sourceCardId: string,
  targets: string[],
): EngineEvent[] {
  const events: EngineEvent[] = [];

  const abilities = (cardDefinition as any).ability;
  if (!abilities || !abilities[abilityIndex]) return events;

  const ability = abilities[abilityIndex];
  const operations: string[] = ability.operations ?? [];

  for (const op of operations) {
    events.push(...executeOperation(state, op, activatingPlayer, sourceCardId, targets));
  }

  return events;
}

/**
 * Find the first ability matching a trigger for a card definition.
 */
export function findAbilityByTrigger(
  cardDefinition: CardDefinition,
  trigger: string,
): { index: number; ability: any } | null {
  const abilities = (cardDefinition as any).ability;
  if (!abilities) return null;

  for (let i = 0; i < abilities.length; i++) {
    if (abilities[i].trigger === trigger) {
      return { index: i, ability: abilities[i] };
    }
  }
  return null;
}
```

**Step 3: Write tests**

Create `packages/engine/src/__tests__/effects.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { executeEffect } from "../effects/interpreter.js";
import { createInitialState } from "../engine.js";
import { DEFAULT_CONFIG } from "../types/config.js";

const lookup = {
  "spell1": {
    name: "Test Spell", type: "spell", cardType: "spell", spellType: "normal",
    rarity: "common", archetype: "dropouts",
    ability: [{ trigger: "OnSpellActivation", speed: 1, targets: ["target"], operations: ["DESTROY: target"] }],
  },
  "spell_draw": {
    name: "Draw Spell", type: "spell", cardType: "spell", spellType: "normal",
    rarity: "common", archetype: "geeks",
    ability: [{ trigger: "OnSpellActivation", speed: 1, targets: ["self"], operations: ["DRAW: 2"] }],
  },
  "spell_damage": {
    name: "Damage Spell", type: "spell", cardType: "spell", spellType: "normal",
    rarity: "common", archetype: "dropouts",
    ability: [{ trigger: "OnSpellActivation", speed: 1, targets: ["opponent"], operations: ["DAMAGE: 500"] }],
  },
  "spell_boost": {
    name: "Boost Spell", type: "spell", cardType: "spell", spellType: "normal",
    rarity: "common", archetype: "preps",
    ability: [{ trigger: "OnSpellActivation", speed: 1, targets: ["target"], operations: ["MODIFY_STAT: attack +500"] }],
  },
  "m1": { name: "M1", type: "stereotype", cardType: "stereotype", level: 4, attack: 1500, defense: 1000, rarity: "common", archetype: "dropouts" },
} as any;

function makeState() {
  const hostDeck = Array(35).fill("m1");
  const awayDeck = Array(35).fill("m1");
  return createInitialState(lookup, DEFAULT_CONFIG, "h", "a", hostDeck, awayDeck, "host");
}

describe("executeEffect", () => {
  it("generates CARD_DESTROYED events for DESTROY operation", () => {
    const state = makeState();
    state.awayBoard = [{ cardId: "target1", definitionId: "m1", position: "attack", faceDown: false, canAttack: true, hasAttackedThisTurn: false, changedPositionThisTurn: false, viceCounters: 0, temporaryBoosts: { attack: 0, defense: 0 }, equippedCards: [], turnSummoned: 1 }];
    const events = executeEffect(state, lookup["spell1"], 0, "host", "spell1", ["target1"]);
    expect(events.some(e => e.type === "CARD_DESTROYED" && e.cardId === "target1")).toBe(true);
    expect(events.some(e => e.type === "CARD_SENT_TO_GRAVEYARD")).toBe(true);
  });

  it("generates CARD_DRAWN events for DRAW operation", () => {
    const state = makeState();
    const events = executeEffect(state, lookup["spell_draw"], 0, "host", "spell_draw", []);
    const draws = events.filter(e => e.type === "CARD_DRAWN");
    expect(draws.length).toBe(2);
  });

  it("generates DAMAGE_DEALT for DAMAGE operation", () => {
    const state = makeState();
    const events = executeEffect(state, lookup["spell_damage"], 0, "host", "spell_damage", []);
    expect(events.some(e => e.type === "DAMAGE_DEALT" && e.amount === 500)).toBe(true);
  });

  it("generates MODIFIER_APPLIED for MODIFY_STAT operation", () => {
    const state = makeState();
    const events = executeEffect(state, lookup["spell_boost"], 0, "host", "spell_boost", ["m1"]);
    expect(events.some(e => e.type === "MODIFIER_APPLIED" && e.amount === 500)).toBe(true);
  });

  it("returns empty for missing ability index", () => {
    const state = makeState();
    const events = executeEffect(state, lookup["m1"], 5, "host", "m1", []);
    expect(events).toEqual([]);
  });
});
```

**Step 4: Run tests**

Run: `cd packages/engine && bun run test -- --reporter=verbose src/__tests__/effects.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/engine/src/effects/
git add packages/engine/src/__tests__/effects.test.ts
git commit -m "feat(engine): add card effect interpreter with operation handlers"
```

---

### Task 3: Wire effects into spell/trap activation

**Files:**
- Modify: `packages/engine/src/rules/spellsTraps.ts` — update `decideActivateSpell` and `decideActivateTrap`
- Modify: `packages/engine/src/engine.ts` — handle `MODIFIER_APPLIED`, `CARD_BANISHED`, `CARD_RETURNED_TO_HAND` in evolve()
- Test: `packages/engine/src/__tests__/spellsTraps.test.ts`

**Step 1: Update decideActivateSpell to run effects**

In `packages/engine/src/rules/spellsTraps.ts`, add import at top:

```typescript
import { executeEffect, findAbilityByTrigger } from "../effects/interpreter.js";
```

Then in `decideActivateSpell`, after the `SPELL_ACTIVATED` event push, add effect execution:

```typescript
  // After: events.push({ type: "SPELL_ACTIVATED", seat, cardId, targets });

  // Execute spell effect
  const abilityMatch = findAbilityByTrigger(card, "OnSpellActivation");
  if (abilityMatch) {
    events.push(...executeEffect(state, card, abilityMatch.index, seat, cardId, targets));
  }
```

Do the same in `decideActivateTrap`, after `TRAP_ACTIVATED`:

```typescript
  // Execute trap effect
  const abilityMatch = findAbilityByTrigger(card, "OnTrapActivation");
  if (abilityMatch) {
    events.push(...executeEffect(state, card, abilityMatch.index, seat, cardId, targets));
  }
```

**Step 2: Add new evolve handlers in engine.ts**

In the `evolve()` switch statement, add handlers for:

```typescript
      case "MODIFIER_APPLIED": {
        const { cardId, field, amount } = event;
        // Find card on either board and apply temporary boost
        for (const boardKey of ["hostBoard", "awayBoard"] as const) {
          const idx = newState[boardKey].findIndex((c) => c.cardId === cardId);
          if (idx > -1) {
            newState[boardKey] = [...newState[boardKey]];
            const card = { ...newState[boardKey][idx] };
            card.temporaryBoosts = { ...card.temporaryBoosts };
            card.temporaryBoosts[field] += amount;
            newState[boardKey][idx] = card;
            break;
          }
        }
        break;
      }

      case "CARD_BANISHED": {
        const { cardId } = event;
        // Remove from board, add to banished
        for (const [boardKey, banishedKey] of [["hostBoard", "hostBanished"], ["awayBoard", "awayBanished"]] as const) {
          const idx = (newState as any)[boardKey].findIndex((c: any) => c.cardId === cardId);
          if (idx > -1) {
            (newState as any)[boardKey] = [...(newState as any)[boardKey]];
            (newState as any)[boardKey].splice(idx, 1);
            (newState as any)[banishedKey] = [...(newState as any)[banishedKey], cardId];
            break;
          }
        }
        break;
      }

      case "CARD_RETURNED_TO_HAND": {
        const { cardId } = event;
        // Remove from board, add to hand
        for (const [boardKey, handKey] of [["hostBoard", "hostHand"], ["awayBoard", "awayHand"]] as const) {
          const idx = (newState as any)[boardKey].findIndex((c: any) => c.cardId === cardId);
          if (idx > -1) {
            (newState as any)[boardKey] = [...(newState as any)[boardKey]];
            (newState as any)[boardKey].splice(idx, 1);
            (newState as any)[handKey] = [...(newState as any)[handKey], cardId];
            break;
          }
        }
        break;
      }

      case "SPECIAL_SUMMONED": {
        const { seat, cardId, position } = event;
        const isHost = seat === "host";
        const board = isHost ? [...newState.hostBoard] : [...newState.awayBoard];
        // Remove from graveyard if there
        const gyKey = isHost ? "hostGraveyard" : "awayGraveyard";
        const gy = [...(newState as any)[gyKey]];
        const gyIdx = gy.indexOf(cardId);
        if (gyIdx > -1) gy.splice(gyIdx, 1);
        (newState as any)[gyKey] = gy;

        const newCard: BoardCard = {
          cardId, definitionId: cardId, position, faceDown: false,
          canAttack: false, hasAttackedThisTurn: false, changedPositionThisTurn: false,
          viceCounters: 0, temporaryBoosts: { attack: 0, defense: 0 }, equippedCards: [],
          turnSummoned: newState.turnNumber,
        };
        board.push(newCard);
        if (isHost) newState.hostBoard = board;
        else newState.awayBoard = board;
        break;
      }
```

**Step 3: Run existing tests + add new ones**

Run: `cd packages/engine && bun run test`
Expected: All existing tests still pass + new effect tests pass

**Step 4: Commit**

```bash
git add packages/engine/src/rules/spellsTraps.ts packages/engine/src/engine.ts
git commit -m "feat(engine): wire card effects into spell/trap activation + new evolve handlers"
```

---

## Workstream 3: Frontend — Game Board

### Task 4: Create useGameState hook

**Files:**
- Create: `apps/web/src/components/game/hooks/useGameState.ts`

```typescript
import { useMemo } from "react";
import { apiAny, useConvexQuery } from "@/lib/convexHelpers";
import type { PlayerView, BoardCard, SpellTrapCard, Command, CardDefinition } from "@lunchtable-tcg/engine";

export type EnrichedCard = {
  cardId: string;
  definition: CardDefinition | null;
};

export type ValidActions = {
  canSummon: Map<string, { positions: ("attack" | "defense")[]; needsTribute: boolean }>;
  canSetMonster: Set<string>;
  canSetSpellTrap: Set<string>;
  canActivateSpell: Set<string>;
  canActivateTrap: Set<string>;
  canAttack: Map<string, string[]>; // attackerId → targetIds (empty string = direct)
  canFlipSummon: Set<string>;
};

export function useGameState(matchId: string | undefined) {
  const meta = useConvexQuery(
    apiAny.game.getMatchMeta,
    matchId ? { matchId } : "skip",
  ) as any | null | undefined;

  const viewJson = useConvexQuery(
    apiAny.game.getPlayerView,
    matchId ? { matchId, seat: "host" as const } : "skip",
  ) as string | null | undefined;

  const allCards = useConvexQuery(apiAny.game.getAllCards, {}) as any[] | undefined;

  const view: PlayerView | null = useMemo(() => {
    if (!viewJson) return null;
    try { return JSON.parse(viewJson); } catch { return null; }
  }, [viewJson]);

  const cardLookup: Record<string, CardDefinition> = useMemo(() => {
    if (!allCards) return {};
    const map: Record<string, any> = {};
    for (const c of allCards) map[c._id] = c;
    return map;
  }, [allCards]);

  const isMyTurn = view?.currentTurnPlayer === view?.mySeat;
  const phase = view?.currentPhase ?? "draw";
  const gameOver = view?.gameOver ?? false;

  const validActions: ValidActions = useMemo(() => {
    const va: ValidActions = {
      canSummon: new Map(),
      canSetMonster: new Set(),
      canSetSpellTrap: new Set(),
      canActivateSpell: new Set(),
      canActivateTrap: new Set(),
      canAttack: new Map(),
      canFlipSummon: new Set(),
    };

    if (!view || !isMyTurn || gameOver) return va;

    const isMainPhase = phase === "main" || phase === "main2";
    const board = view.board;
    const hand = view.hand;
    const stZone = view.spellTrapZone;

    if (isMainPhase) {
      // Check if normal summon is available (simple heuristic — backend validates)
      const canNormalSummon = board.length < 5; // maxBoardSlots

      if (canNormalSummon) {
        for (const cardId of hand) {
          const card = cardLookup[cardId];
          if (!card) continue;
          if (card.type === "stereotype" || (card as any).cardType === "stereotype") {
            const level = (card as any).level ?? 0;
            const needsTribute = level >= 7;
            va.canSummon.set(cardId, { positions: ["attack", "defense"], needsTribute });
            va.canSetMonster.add(cardId);
          }
        }
      }

      // Spells/traps from hand
      if (stZone.length < 5) {
        for (const cardId of hand) {
          const card = cardLookup[cardId];
          if (!card) continue;
          if (card.type === "spell" || (card as any).cardType === "spell") {
            va.canSetSpellTrap.add(cardId);
            va.canActivateSpell.add(cardId);
          }
          if (card.type === "trap" || (card as any).cardType === "trap") {
            va.canSetSpellTrap.add(cardId);
          }
        }
      }

      // Activate set spells/traps
      for (const stCard of stZone) {
        if (!stCard.faceDown) continue;
        const card = cardLookup[stCard.definitionId];
        if (!card) continue;
        if (card.type === "spell") va.canActivateSpell.add(stCard.cardId);
        if (card.type === "trap") va.canActivateTrap.add(stCard.cardId);
      }

      // Flip summon
      for (const bc of board) {
        if (bc.faceDown && bc.turnSummoned < (view.turnNumber ?? 999)) {
          va.canFlipSummon.add(bc.cardId);
        }
      }
    }

    // Combat phase attacks
    if (phase === "combat" && (view.turnNumber ?? 0) > 1) {
      for (const mon of board) {
        if (mon.faceDown || !mon.canAttack || mon.hasAttackedThisTurn) continue;
        const targets: string[] = [];
        for (const opp of view.opponentBoard) {
          targets.push(opp.cardId);
        }
        const faceUpOpponents = view.opponentBoard.filter(c => !c.faceDown);
        if (faceUpOpponents.length === 0) {
          targets.push(""); // direct attack
        }
        va.canAttack.set(mon.cardId, targets);
      }
    }

    return va;
  }, [view, isMyTurn, phase, gameOver, cardLookup]);

  return {
    meta,
    view,
    cardLookup,
    isMyTurn,
    phase,
    gameOver,
    validActions,
    isLoading: meta === undefined || viewJson === undefined,
    notFound: meta === null,
  };
}
```

**Step 1: Create the file as shown above.**

**Step 2: Commit**

```bash
git add apps/web/src/components/game/hooks/useGameState.ts
git commit -m "feat(ui): add useGameState hook with valid action derivation"
```

---

### Task 5: Create useGameActions hook

**Files:**
- Create: `apps/web/src/components/game/hooks/useGameActions.ts`

```typescript
import { useState, useCallback } from "react";
import * as Sentry from "@sentry/react";
import { apiAny, useConvexMutation } from "@/lib/convexHelpers";
import type { Position } from "@lunchtable-tcg/engine";

export function useGameActions(matchId: string | undefined) {
  const submitAction = useConvexMutation(apiAny.game.submitAction);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const send = useCallback(
    async (command: Record<string, unknown>) => {
      if (!matchId || submitting) return;
      setSubmitting(true);
      setError("");
      try {
        await submitAction({
          matchId,
          command: JSON.stringify(command),
          seat: "host" as const,
        });
      } catch (err: any) {
        Sentry.captureException(err);
        setError(err.message ?? "Action failed.");
      } finally {
        setSubmitting(false);
      }
    },
    [matchId, submitAction, submitting],
  );

  return {
    submitting,
    error,
    clearError: () => setError(""),
    advancePhase: () => send({ type: "ADVANCE_PHASE" }),
    endTurn: () => send({ type: "END_TURN" }),
    surrender: () => send({ type: "SURRENDER" }),
    summon: (cardId: string, position: Position, tributeCardIds?: string[]) =>
      send({ type: "SUMMON", cardId, position, tributeCardIds }),
    setMonster: (cardId: string) => send({ type: "SET_MONSTER", cardId }),
    flipSummon: (cardId: string) => send({ type: "FLIP_SUMMON", cardId }),
    setSpellTrap: (cardId: string) => send({ type: "SET_SPELL_TRAP", cardId }),
    activateSpell: (cardId: string, targets?: string[]) =>
      send({ type: "ACTIVATE_SPELL", cardId, targets }),
    activateTrap: (cardId: string, targets?: string[]) =>
      send({ type: "ACTIVATE_TRAP", cardId, targets }),
    declareAttack: (attackerId: string, targetId?: string) =>
      send({ type: "DECLARE_ATTACK", attackerId, targetId }),
    chainResponse: (cardId?: string, pass = true) =>
      send({ type: "CHAIN_RESPONSE", cardId, pass }),
  };
}
```

**Commit:**

```bash
git add apps/web/src/components/game/hooks/useGameActions.ts
git commit -m "feat(ui): add useGameActions hook wrapping all command types"
```

---

### Task 6: Build core game board components

**Files:**
- Create: `apps/web/src/components/game/LPBar.tsx`
- Create: `apps/web/src/components/game/PhaseBar.tsx`
- Create: `apps/web/src/components/game/BoardSlot.tsx`
- Create: `apps/web/src/components/game/FieldRow.tsx`
- Create: `apps/web/src/components/game/HandCard.tsx`
- Create: `apps/web/src/components/game/PlayerHand.tsx`

Each component should use the zine aesthetic (paper-panel, ink borders, Special Elite font, #121212 ink, #ffcc00 accent). Use Framer Motion for hover/tap animations. Use `cardLookup` to resolve card names and stats from IDs.

Key implementation details for each:

**LPBar**: Simple bar showing LP with Outfit font weight 900. Flash red on damage, green on heal. Show LP number prominently.

**PhaseBar**: Horizontal strip showing all phases. Current phase highlighted with yellow background. Clickable to advance (calls `advancePhase()`).

**BoardSlot**: Renders a single board position. Empty = dashed border. Monster = paper-panel with name + ATK/DEF. Face-down = ink rectangle with "?". Clickable when valid action available (yellow border pulse). Accepts `onClick` callback.

**FieldRow**: Row of 5 BoardSlots. Takes `cards: BoardCard[]` and `onSlotClick` callback.

**HandCard**: Individual card in hand. Shows card name, type icon, ATK/DEF for monsters. Playable cards get yellow pulsing border (`animate-pulse ring-2 ring-[#ffcc00]`). Click opens action sheet. Fan layout offset: `rotate: (index - center) * 3deg`, `translateY: Math.abs(index - center) * 4px`.

**PlayerHand**: Container for HandCards with fan arc. Overflow scrollable on mobile.

These are UI-only components — no game logic, just rendering + click callbacks.

**Commit after creating all 6:**

```bash
git add apps/web/src/components/game/
git commit -m "feat(ui): add core board components — LPBar, PhaseBar, BoardSlot, FieldRow, HandCard, PlayerHand"
```

---

### Task 7: Build action sheets and selectors

**Files:**
- Create: `apps/web/src/components/game/ActionSheet.tsx`
- Create: `apps/web/src/components/game/TributeSelector.tsx`
- Create: `apps/web/src/components/game/AttackTargetSelector.tsx`
- Create: `apps/web/src/components/game/GraveyardBrowser.tsx`

**ActionSheet**: Bottom sheet modal (Framer Motion slide-up). Shows card name + options based on card type:
- Monster in hand: "Summon ATK" / "Summon DEF" / "Set Face-Down" / Cancel
- Spell in hand: "Activate" / "Set Face-Down" / Cancel
- Trap in hand: "Set Face-Down" / Cancel
- Set spell in backrow: "Activate" / Cancel
- Set trap in backrow: "Activate" / Cancel

**TributeSelector**: Overlay showing player's face-up monsters as selectable grid. Multi-select up to required count. "Confirm" button. Shown when summoning level 7+ monsters.

**AttackTargetSelector**: Overlay showing opponent monsters + "Direct Attack" option. Each target shows ATK/DEF and win/lose prediction color. Shown when clicking a monster during combat phase.

**GraveyardBrowser**: Full-screen overlay with scrollable list of cards in graveyard or banished zone. Each card shows name, type, stats. Close button at top. Accessible from clicking GY/Banished pile icons on the board.

**Commit:**

```bash
git add apps/web/src/components/game/ActionSheet.tsx
git add apps/web/src/components/game/TributeSelector.tsx
git add apps/web/src/components/game/AttackTargetSelector.tsx
git add apps/web/src/components/game/GraveyardBrowser.tsx
git commit -m "feat(ui): add ActionSheet, TributeSelector, AttackTargetSelector, GraveyardBrowser"
```

---

### Task 8: Build GameBoard root component and wire into Play page

**Files:**
- Create: `apps/web/src/components/game/GameBoard.tsx`
- Modify: `apps/web/src/pages/Play.tsx` — replace skeleton with GameBoard

**GameBoard.tsx**: The root layout component. Manages selection state:
- `selectedHandCard: string | null`
- `selectedBoardCard: string | null`
- `showActionSheet: boolean`
- `showTributeSelector: boolean`
- `showAttackTargets: boolean`
- `showGraveyard: { zone: "graveyard" | "banished"; owner: "player" | "opponent" } | null`

Layout structure (see design doc for ASCII art). Full viewport height, no scroll. Uses `useGameState` + `useGameActions` hooks.

Click handlers:
- Hand card click → if playable, set selectedHandCard + open ActionSheet
- Board monster click (combat phase) → if canAttack, set selectedBoardCard + open AttackTargetSelector
- Board monster click (main phase, face-down) → if canFlipSummon, call flipSummon()
- GY icon click → open GraveyardBrowser
- Phase bar click → advancePhase()
- End Turn button → endTurn()

ActionSheet callbacks route to appropriate `useGameActions` methods.

**Play.tsx**: Keep existing meta query, game over screens, and story completion logic. Replace the active game section with `<GameBoard matchId={matchId} />`. Import GameBoard component.

**Commit:**

```bash
git add apps/web/src/components/game/GameBoard.tsx apps/web/src/pages/Play.tsx
git commit -m "feat(ui): build GameBoard root component and wire into Play page"
```

---

## Workstream 4: Backend — AI Opponent

### Task 9: Replace AI stub with heuristic logic

**Files:**
- Modify: `convex/game.ts` — rewrite `executeAITurn`

Replace the `executeAITurn` internal mutation with:

```typescript
export const executeAITurn = internalMutation({
  args: { matchId: v.string() },
  handler: async (ctx, args) => {
    const meta = await match.getMatchMeta(ctx, { matchId: args.matchId });
    if ((meta as any)?.status !== "active") return;

    const allCards = await cards.cards.getAllCards(ctx);
    const cardLookup: Record<string, any> = {};
    for (const c of (allCards ?? [])) cardLookup[c._id] = c;

    // Loop: take actions until it's no longer AI's turn or game ends
    for (let actionCount = 0; actionCount < 20; actionCount++) {
      const viewJson = await match.getPlayerView(ctx, { matchId: args.matchId, seat: "away" });
      if (!viewJson) return;
      const view = JSON.parse(viewJson);
      if (view.currentTurnPlayer !== "away" || view.gameOver) return;

      const command = pickAICommand(view, cardLookup);
      if (!command) return;

      try {
        await match.submitAction(ctx, {
          matchId: args.matchId,
          command: JSON.stringify(command),
          seat: "away",
        });
      } catch {
        return; // Game ended or invalid action
      }

      // If we just ended the turn, stop
      if (command.type === "END_TURN") return;
    }
  },
});

function pickAICommand(view: any, cardLookup: Record<string, any>): Command | null {
  const phase = view.currentPhase;
  const board = view.board ?? [];
  const hand = view.hand ?? [];
  const opponentBoard = view.opponentBoard ?? [];
  const stZone = view.spellTrapZone ?? [];

  // Draw / Standby / Breakdown / End phases → advance
  if (phase === "draw" || phase === "standby" || phase === "breakdown_check" || phase === "end") {
    return { type: "ADVANCE_PHASE" };
  }

  // Main phase
  if (phase === "main" || phase === "main2") {
    // 1. Try to summon strongest monster
    if (board.length < 5) {
      const monsters = hand
        .map((id: string) => ({ id, def: cardLookup[id] }))
        .filter((c: any) => c.def && (c.def.type === "stereotype" || c.def.cardType === "stereotype"))
        .sort((a: any, b: any) => (b.def.attack ?? 0) - (a.def.attack ?? 0));

      for (const mon of monsters) {
        const level = mon.def.level ?? 0;
        if (level < 7) {
          return { type: "SUMMON", cardId: mon.id, position: "attack" as const };
        } else if (level >= 7 && board.length > 0) {
          const tribute = board.find((c: any) => !c.faceDown);
          if (tribute) {
            return { type: "SUMMON", cardId: mon.id, position: "attack" as const, tributeCardIds: [tribute.cardId] };
          }
        }
      }
    }

    // 2. Set spells/traps
    if (stZone.length < 5) {
      const spellTraps = hand
        .map((id: string) => ({ id, def: cardLookup[id] }))
        .filter((c: any) => c.def && (c.def.type === "spell" || c.def.type === "trap" || c.def.cardType === "spell" || c.def.cardType === "trap"));

      if (spellTraps.length > 0) {
        return { type: "SET_SPELL_TRAP", cardId: spellTraps[0].id };
      }
    }

    // 3. If main phase 1, advance to combat
    if (phase === "main" && board.length > 0) {
      return { type: "ADVANCE_PHASE" };
    }

    // 4. End turn from main2
    if (phase === "main2") {
      return { type: "END_TURN" };
    }

    return { type: "ADVANCE_PHASE" };
  }

  // Combat phase
  if (phase === "combat") {
    for (const mon of board) {
      if (mon.faceDown || !mon.canAttack || mon.hasAttackedThisTurn) continue;
      const monDef = cardLookup[mon.definitionId];
      const monAtk = (monDef?.attack ?? 0) + (mon.temporaryBoosts?.attack ?? 0);

      // Direct attack if no face-up opponents
      const faceUpOpponents = opponentBoard.filter((c: any) => !c.faceDown);
      if (faceUpOpponents.length === 0) {
        return { type: "DECLARE_ATTACK", attackerId: mon.cardId };
      }

      // Attack weakest opponent
      const weakest = faceUpOpponents
        .map((c: any) => {
          const def = cardLookup[c.definitionId];
          const stat = c.position === "attack" ? (def?.attack ?? 0) : (def?.defense ?? 0);
          return { ...c, stat };
        })
        .sort((a: any, b: any) => a.stat - b.stat)[0];

      if (weakest && monAtk > weakest.stat) {
        return { type: "DECLARE_ATTACK", attackerId: mon.cardId, targetId: weakest.cardId };
      }
    }

    return { type: "ADVANCE_PHASE" };
  }

  return { type: "END_TURN" };
}
```

**Commit:**

```bash
git add convex/game.ts
git commit -m "feat(ai): replace END_TURN stub with heuristic AI — summon, attack, set spells"
```

---

## Workstream 5: Engine — Chain System

### Task 10: Add chain/priority logic

**Files:**
- Create: `packages/engine/src/rules/chain.ts`
- Modify: `packages/engine/src/engine.ts` — handle CHAIN_RESPONSE command, chain events in evolve()

**Step 1: Create chain.ts**

```typescript
import type { GameState, Seat, EngineEvent, ChainLink } from "../types/index.js";
import type { Command } from "../types/commands.js";
import { opponentSeat } from "./phases.js";
import { executeEffect, findAbilityByTrigger } from "../effects/interpreter.js";

export function decideChainResponse(
  state: GameState,
  seat: Seat,
  command: Extract<Command, { type: "CHAIN_RESPONSE" }>,
): EngineEvent[] {
  const events: EngineEvent[] = [];

  if (command.pass) {
    events.push({ type: "CHAIN_PASSED", seat });

    // Check if both players passed — resolve chain
    // A chain resolves when the last link was added by player A,
    // priority passed to B, and B passes.
    if (state.currentChain.length > 0) {
      events.push({ type: "CHAIN_RESOLVED" });
      // Resolve LIFO
      const chain = [...state.currentChain].reverse();
      for (const link of chain) {
        const cardDef = state.cardLookup[link.cardId];
        if (cardDef) {
          events.push(...executeEffect(
            state, cardDef, link.effectIndex, link.activatingPlayer, link.cardId, link.targets,
          ));
        }
      }
    }
  } else if (command.cardId) {
    // Adding a chain link
    const cardId = command.cardId;
    const zones = seat === "host" ? state.hostSpellTrapZone : state.awaySpellTrapZone;
    const setCard = zones.find(c => c.cardId === cardId);
    if (!setCard) return events;

    const cardDef = state.cardLookup[setCard.definitionId];
    if (!cardDef) return events;

    const ability = findAbilityByTrigger(cardDef, "OnTrapActivation");
    const effectIndex = ability?.index ?? 0;

    events.push({
      type: "CHAIN_LINK_ADDED",
      cardId,
      seat,
      effectIndex,
    });

    // Activate the trap (move to graveyard etc.)
    events.push({
      type: "TRAP_ACTIVATED",
      seat,
      cardId,
      targets: [],
    });
  }

  return events;
}
```

**Step 2: Wire into engine.ts decide()**

In the `decide()` switch, add:

```typescript
    case "CHAIN_RESPONSE": {
      events.push(...decideChainResponse(state, seat, command));
      break;
    }
```

And in `evolve()`:

```typescript
      case "CHAIN_STARTED": {
        newState.currentChain = [];
        break;
      }

      case "CHAIN_LINK_ADDED": {
        const { cardId, seat, effectIndex } = event;
        newState.currentChain = [...newState.currentChain, {
          cardId, activatingPlayer: seat, effectIndex, targets: [],
        }];
        newState.currentPriorityPlayer = opponentSeat(seat);
        break;
      }

      case "CHAIN_RESOLVED": {
        newState.currentChain = [];
        newState.currentPriorityPlayer = null;
        break;
      }

      case "CHAIN_PASSED": {
        // Handled by chain resolution logic
        break;
      }
```

**Step 3: Commit**

```bash
git add packages/engine/src/rules/chain.ts packages/engine/src/engine.ts
git commit -m "feat(engine): add chain/priority system with LIFO resolution"
```

---

### Task 11: Build ChainPrompt frontend component

**Files:**
- Create: `apps/web/src/components/game/ChainPrompt.tsx`

Bottom-overlay prompt shown when opponent activates something and player has activatable traps. Shows: "Opponent activated [card]! Respond?" with list of activatable traps and a "Pass" button. 5-second auto-pass timer (countdown shown). Calls `chainResponse()` from useGameActions.

**Commit:**

```bash
git add apps/web/src/components/game/ChainPrompt.tsx
git commit -m "feat(ui): add ChainPrompt component for trap response window"
```

---

### Task 12: Build GameOverOverlay

**Files:**
- Create: `apps/web/src/components/game/GameOverOverlay.tsx`

Full-screen overlay with victory/defeat result. Shows stars, rewards (for story mode), and navigation buttons. Reuses existing VictoryScreen for story mode, adds a simpler overlay for non-story matches.

**Commit:**

```bash
git add apps/web/src/components/game/GameOverOverlay.tsx
git commit -m "feat(ui): add GameOverOverlay component"
```

---

### Task 13: Integration test — full match flow

**Step 1: Run the dev server**

```bash
cd /Users/home/Desktop/LTCG-v2 && bun run dev
```

**Step 2: Manual verification checklist**

- [ ] Navigate to /story, pick a chapter, click a stage → fight button
- [ ] Match loads, board renders with hand cards and empty field
- [ ] Click hand card → ActionSheet opens with summon options
- [ ] Summon a monster → card moves from hand to field
- [ ] Advance to combat phase → attack targets become available
- [ ] Click monster → AttackTargetSelector shows opponent monsters or direct attack
- [ ] Attack → damage dealt, LP updates
- [ ] End turn → AI takes its turn (summons, attacks, ends)
- [ ] Play until win/lose → GameOverOverlay shows
- [ ] Story completion → stars and rewards display
- [ ] GY icon → GraveyardBrowser opens with destroyed cards

**Step 3: Run engine tests**

```bash
cd packages/engine && bun run test
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete playable game — board UI, effects, AI, chain system"
```

---

## File Summary

### New Files (17)

```
packages/engine/src/effects/interpreter.ts
packages/engine/src/effects/operations.ts
packages/engine/src/rules/chain.ts
packages/engine/src/__tests__/effects.test.ts
apps/web/src/components/game/hooks/useGameState.ts
apps/web/src/components/game/hooks/useGameActions.ts
apps/web/src/components/game/GameBoard.tsx
apps/web/src/components/game/PlayerHand.tsx
apps/web/src/components/game/HandCard.tsx
apps/web/src/components/game/FieldRow.tsx
apps/web/src/components/game/BoardSlot.tsx
apps/web/src/components/game/PhaseBar.tsx
apps/web/src/components/game/LPBar.tsx
apps/web/src/components/game/ActionSheet.tsx
apps/web/src/components/game/TributeSelector.tsx
apps/web/src/components/game/AttackTargetSelector.tsx
apps/web/src/components/game/GraveyardBrowser.tsx
apps/web/src/components/game/ChainPrompt.tsx
apps/web/src/components/game/GameOverOverlay.tsx
```

### Modified Files (4)

```
packages/engine/src/engine.ts          — legalMoves() + new evolve handlers
packages/engine/src/rules/spellsTraps.ts — wire effects into activation
packages/engine/src/__tests__/engine.test.ts — legalMoves tests
convex/game.ts                         — AI heuristic logic
apps/web/src/pages/Play.tsx            — wire in GameBoard
```
