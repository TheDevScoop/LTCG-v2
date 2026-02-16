# Card Balance Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the LP-based system with Reputation/Stability/Clout triple resources, wire up vice counter interactions per archetype, fix the effect parser's dropped operations, and rebalance card data.

**Architecture:** Event-sourced engine modifications. Each change follows: update types -> write failing test -> implement -> pass test -> commit. The engine stays pure TS with zero deps. All changes are backwards-compatible within the engine package, but the Convex backend and frontend will need follow-up updates to use the new PlayerView fields.

**Tech Stack:** TypeScript, Vitest, `@lunchtable-tcg/engine`

**Test command:** `cd /Users/home/Desktop/LTCG-v2 && bun run test:once --filter engine`

---

## Task 1: Update Engine Types — Resources, Config, WinReason

**Files:**
- Modify: `packages/engine/src/types/config.ts`
- Modify: `packages/engine/src/types/state.ts`
- Modify: `packages/engine/src/types/events.ts`
- Modify: `packages/engine/src/types/cards.ts`

**Step 1: Update EngineConfig**

In `packages/engine/src/types/config.ts`, replace `startingLP` with the new resource fields:

```typescript
export interface EngineConfig {
  startingReputation: number;
  reputationToWin: number;
  startingStability: number;
  maxCloutPerTurn: number;
  deckSize: { min: number; max: number };
  maxHandSize: number;
  maxBoardSlots: number;
  maxSpellTrapSlots: number;
  startingHandSize: number;
  breakdownThreshold: number;
  maxBreakdownsToWin: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  startingReputation: 0,
  reputationToWin: 10000,
  startingStability: 5000,
  maxCloutPerTurn: 4,
  deckSize: { min: 40, max: 60 },
  maxHandSize: 7,
  maxBoardSlots: 3,
  maxSpellTrapSlots: 3,
  startingHandSize: 5,
  breakdownThreshold: 3,
  maxBreakdownsToWin: 3,
};
```

**Step 2: Update WinReason and GameState**

In `packages/engine/src/types/state.ts`:

Replace `WinReason`:
```typescript
export type WinReason = "reputation_max" | "stability_zero" | "breakdown" | "deck_out" | "surrender";
```

Replace LP fields in `GameState` with:
```typescript
// Resources (replace hostLifePoints/awayLifePoints)
hostReputation: number;
awayReputation: number;
hostStability: number;
awayStability: number;
hostClout: number;
awayClout: number;
hostMaxClout: number;
awayMaxClout: number;
```

Update `PlayerView` to replace `lifePoints`/`opponentLifePoints` with:
```typescript
reputation: number;
stability: number;
clout: number;
maxClout: number;
opponentReputation: number;
opponentStability: number;
```

**Step 3: Add new event types**

In `packages/engine/src/types/events.ts`, add these variants to `EngineEvent`:
```typescript
| { type: "REPUTATION_CHANGED"; seat: Seat; amount: number; newTotal: number }
| { type: "STABILITY_CHANGED"; seat: Seat; amount: number; newTotal: number }
| { type: "CLOUT_GAINED"; seat: Seat; amount: number }
| { type: "CLOUT_SPENT"; seat: Seat; amount: number; remaining: number }
| { type: "STABILITY_COLLAPSED"; seat: Seat }
```

**Step 4: Add new EffectAction types**

In `packages/engine/src/types/cards.ts`:

Add `scaling` field and new action variants to `EffectAction`:
```typescript
// Add to existing union:
| { type: "modify_reputation"; amount: number; target: "self" | "opponent"; scaling?: ScalingDef }
| { type: "modify_stability"; amount: number; target: "self" | "opponent"; scaling?: ScalingDef }
| { type: "scry"; count: number }
| { type: "reveal_hand"; target: "opponent" }
| { type: "redirect_attack"; target: "selected" }
| { type: "modify_cost"; cardType: "spell" | "trap" | "stereotype"; amount: number }
| { type: "random_discard"; count: number; target: "opponent" }

// New type:
export interface ScalingDef {
  per: "controlled_archetype" | "graveyard_cards" | "hand_size" | "vice_counters" | "spells_in_graveyard";
  archetype?: string;
  multiplier: number;
}
```

Widen `Attribute` type:
```typescript
export type Attribute = string; // Thematic vice attributes
```

Update `CostDefinition` to include clout:
```typescript
export interface CostDefinition {
  type: "tribute" | "discard" | "pay_lp" | "remove_vice" | "banish" | "pay_stability";
  count?: number;
  amount?: number;
}
```

**Step 5: Run existing tests to see what breaks**

```bash
cd /Users/home/Desktop/LTCG-v2 && bun run test:once --filter engine
```

Expected: Many failures because `hostLifePoints` no longer exists.

**Step 6: Commit type changes**

```bash
git add packages/engine/src/types/
git commit -m "feat(engine): add reputation/stability/clout types, replace LP system"
```

---

## Task 2: Update Engine Core — createInitialState, evolve, mask

**Files:**
- Modify: `packages/engine/src/engine.ts`

**Step 1: Update createInitialState (engine.ts:79-138)**

Replace LP initialization with new resources:
```typescript
// Replace:
hostLifePoints: config.startingLP,
awayLifePoints: config.startingLP,

// With:
hostReputation: config.startingReputation,
awayReputation: config.startingReputation,
hostStability: config.startingStability,
awayStability: config.startingStability,
hostClout: 0,
awayClout: 0,
hostMaxClout: 0,
awayMaxClout: 0,
```

**Step 2: Update evolve — TURN_STARTED handler (engine.ts:472-493)**

Add clout reset at turn start:
```typescript
case "TURN_STARTED":
  // ... existing resets ...
  // Set clout for the new turn
  const cloutForTurn = Math.min(event.turnNumber, newState.config.maxCloutPerTurn);
  if (event.seat === "host") {
    newState.hostClout = cloutForTurn;
    newState.hostMaxClout = cloutForTurn;
  } else {
    newState.awayClout = cloutForTurn;
    newState.awayMaxClout = cloutForTurn;
  }
  break;
```

**Step 3: Add evolve handlers for new events**

Add cases in the evolve switch for:
```typescript
case "REPUTATION_CHANGED": {
  if (event.seat === "host") {
    newState.hostReputation = event.newTotal;
  } else {
    newState.awayReputation = event.newTotal;
  }
  break;
}

case "STABILITY_CHANGED": {
  if (event.seat === "host") {
    newState.hostStability = Math.max(0, event.newTotal);
  } else {
    newState.awayStability = Math.max(0, event.newTotal);
  }
  break;
}

case "CLOUT_SPENT": {
  if (event.seat === "host") {
    newState.hostClout = event.remaining;
  } else {
    newState.awayClout = event.remaining;
  }
  break;
}

case "STABILITY_COLLAPSED": {
  const loser = event.seat;
  const winner = opponentSeat(loser);
  newState.gameOver = true;
  newState.winner = winner;
  newState.winReason = "stability_zero";
  break;
}
```

**Step 4: Replace LP state-based check (engine.ts:659-670)**

Replace the LP-zero check at the end of `evolve()` with reputation/stability checks:
```typescript
// State-based checks
if (!newState.gameOver) {
  // Reputation win
  if (newState.hostReputation >= newState.config.reputationToWin) {
    newState.gameOver = true;
    newState.winner = "host";
    newState.winReason = "reputation_max";
  } else if (newState.awayReputation >= newState.config.reputationToWin) {
    newState.gameOver = true;
    newState.winner = "away";
    newState.winReason = "reputation_max";
  }
  // Stability collapse
  else if (newState.hostStability <= 0) {
    newState.gameOver = true;
    newState.winner = "away";
    newState.winReason = "stability_zero";
  } else if (newState.awayStability <= 0) {
    newState.gameOver = true;
    newState.winner = "host";
    newState.winReason = "stability_zero";
  }
}
```

**Step 5: Update mask() (engine.ts:154-210)**

Replace LP references in PlayerView construction:
```typescript
// Replace lifePoints/opponentLifePoints with:
reputation: isHost ? state.hostReputation : state.awayReputation,
stability: isHost ? state.hostStability : state.awayStability,
clout: isHost ? state.hostClout : state.awayClout,
maxClout: isHost ? state.hostMaxClout : state.awayMaxClout,
opponentReputation: isHost ? state.awayReputation : state.hostReputation,
opponentStability: isHost ? state.awayStability : state.hostStability,
```

**Step 6: Commit**

```bash
git add packages/engine/src/engine.ts
git commit -m "feat(engine): implement reputation/stability/clout in core engine loop"
```

---

## Task 3: Update Combat — Damage Reduces Stability

**Files:**
- Modify: `packages/engine/src/rules/combat.ts`
- Test: `packages/engine/src/__tests__/combat.test.ts`

**Step 1: Update evolveCombat DAMAGE_DEALT handler (combat.ts:273-282)**

Replace LP reduction with Stability reduction:
```typescript
case "DAMAGE_DEALT": {
  const { seat, amount } = event;
  if (seat === "host") {
    newState.hostStability = Math.max(0, newState.hostStability - amount);
  } else {
    newState.awayStability = Math.max(0, newState.awayStability - amount);
  }
  break;
}
```

**Step 2: Update combat tests**

In `packages/engine/src/__tests__/combat.test.ts`, replace all `hostLifePoints`/`awayLifePoints` references with `hostStability`/`awayStability`. Replace `startingLP` in config with `startingStability`. Update assertions.

**Step 3: Run tests**

```bash
cd /Users/home/Desktop/LTCG-v2 && bun run test:once --filter engine -- combat
```

**Step 4: Commit**

```bash
git add packages/engine/src/rules/combat.ts packages/engine/src/__tests__/combat.test.ts
git commit -m "feat(engine): battle damage reduces stability instead of LP"
```

---

## Task 4: Update Summoning — Clout Cost System

**Files:**
- Modify: `packages/engine/src/rules/summoning.ts`
- Modify: `packages/engine/src/engine.ts` (legalMoves section)
- Test: `packages/engine/src/__tests__/summoning.test.ts`

**Step 1: Write failing test for clout-based summoning**

In `packages/engine/src/__tests__/summoning.test.ts`, add:
```typescript
it("rejects summon when insufficient clout", () => {
  // Set hostClout to 0, try to summon a cost-2 card
  // Expect empty events (rejected)
});

it("allows summon when sufficient clout and emits CLOUT_SPENT", () => {
  // Set hostClout to 2, summon a cost-2 card
  // Expect MONSTER_SUMMONED + CLOUT_SPENT events
});
```

**Step 2: Update decideSummon (summoning.ts:3-77)**

Replace the tribute system with clout cost check:
```typescript
// Remove tribute check (lines 40-65)
// Add clout check:
const cost = card.cost ?? 1;
const availableClout = seat === "host" ? state.hostClout : state.awayClout;
if (cost > availableClout) {
  return events; // Can't afford
}

// Emit CLOUT_SPENT event before MONSTER_SUMMONED
events.push({
  type: "CLOUT_SPENT" as any,
  seat,
  amount: cost,
  remaining: availableClout - cost,
});

// Remove tributeCardIds from MONSTER_SUMMONED event (tributes field becomes empty array)
events.push({
  type: "MONSTER_SUMMONED",
  seat,
  cardId,
  position,
  tributes: [],
});
```

**Step 3: Update decideSetMonster similarly**

Add clout cost check (cost 1 for setting).

**Step 4: Update decideSetSpellTrap in spellsTraps.ts**

Add clout cost check for setting spells/traps.

**Step 5: Update decideActivateSpell in spellsTraps.ts**

Add clout cost check for activating spells from hand (already-set spells activate free).

**Step 6: Update legalMoves (engine.ts:212-382)**

Replace tribute logic with clout affordability:
```typescript
// Replace the level >= 7 tribute check with:
const cost = card.cost ?? 1;
const availableClout = seat === "host" ? state.hostClout : state.awayClout;
if (cost > availableClout) continue; // Can't afford

// Remove all tributeCardIds logic
moves.push({
  type: "SUMMON",
  cardId,
  position: "attack",
});
moves.push({
  type: "SUMMON",
  cardId,
  position: "defense",
});
```

Also add clout checks for SET_SPELL_TRAP and ACTIVATE_SPELL moves.

**Step 7: Update summoning tests — replace all LP/tribute references**

**Step 8: Run tests**

```bash
cd /Users/home/Desktop/LTCG-v2 && bun run test:once --filter engine -- summoning
```

**Step 9: Commit**

```bash
git add packages/engine/src/rules/summoning.ts packages/engine/src/rules/spellsTraps.ts packages/engine/src/engine.ts packages/engine/src/__tests__/summoning.test.ts
git commit -m "feat(engine): replace tribute system with clout cost economy"
```

---

## Task 5: Update State-Based Actions — New Win Conditions

**Files:**
- Modify: `packages/engine/src/rules/stateBasedActions.ts`
- Test: `packages/engine/src/__tests__/stateBasedActions.test.ts`

**Step 1: Write failing tests**

```typescript
it("detects reputation_max win when host reaches reputationToWin", () => { ... });
it("detects stability_zero loss when host stability reaches 0", () => { ... });
it("reputation_max takes priority over stability_zero if both happen simultaneously", () => { ... });
```

**Step 2: Rewrite checkStateBasedActions**

Replace LP checks with reputation/stability checks:
```typescript
export function checkStateBasedActions(state: GameState): EngineEvent[] {
  const events: EngineEvent[] = [];

  // 1. Reputation win
  if (state.hostReputation >= state.config.reputationToWin) {
    events.push({ type: "GAME_ENDED", winner: "host", reason: "reputation_max" });
    return events;
  }
  if (state.awayReputation >= state.config.reputationToWin) {
    events.push({ type: "GAME_ENDED", winner: "away", reason: "reputation_max" });
    return events;
  }

  // 2. Stability collapse
  if (state.hostStability <= 0) {
    events.push({ type: "GAME_ENDED", winner: "away", reason: "stability_zero" });
    return events;
  }
  if (state.awayStability <= 0) {
    events.push({ type: "GAME_ENDED", winner: "host", reason: "stability_zero" });
    return events;
  }

  // 3. Deck-out (unchanged)
  // 4. Breakdown win (unchanged)
  // 5. Hand size limit (unchanged)
  ...
}
```

**Step 3: Run tests**

```bash
cd /Users/home/Desktop/LTCG-v2 && bun run test:once --filter engine -- stateBasedActions
```

**Step 4: Commit**

```bash
git add packages/engine/src/rules/stateBasedActions.ts packages/engine/src/__tests__/stateBasedActions.test.ts
git commit -m "feat(engine): add reputation_max and stability_zero win conditions"
```

---

## Task 6: New Effect Operations — modify_reputation, modify_stability, and More

**Files:**
- Modify: `packages/engine/src/effects/operations.ts`
- Test: `packages/engine/src/__tests__/effects.test.ts`

**Step 1: Write failing tests for new operations**

```typescript
it("executeAction handles modify_reputation for self", () => { ... });
it("executeAction handles modify_reputation for opponent", () => { ... });
it("executeAction handles modify_stability for self", () => { ... });
it("executeAction handles modify_reputation with scaling", () => { ... });
it("executeAction handles scry", () => { ... });
it("executeAction handles random_discard", () => { ... });
it("executeAction handles add_vice to target", () => { ... });
```

**Step 2: Add scaling resolver helper**

```typescript
function resolveScaling(state: GameState, seat: Seat, scaling: ScalingDef): number {
  const board = seat === "host" ? state.hostBoard : state.awayBoard;
  switch (scaling.per) {
    case "controlled_archetype": {
      const count = board.filter(c => {
        const def = state.cardLookup[c.definitionId];
        return def?.archetype?.toLowerCase() === scaling.archetype?.toLowerCase();
      }).length;
      return count * scaling.multiplier;
    }
    case "graveyard_cards": {
      const gy = seat === "host" ? state.hostGraveyard : state.awayGraveyard;
      return gy.length * scaling.multiplier;
    }
    case "vice_counters": {
      const allBoards = [...state.hostBoard, ...state.awayBoard];
      const total = allBoards.reduce((sum, c) => sum + c.viceCounters, 0);
      return total * scaling.multiplier;
    }
    case "hand_size": {
      const hand = seat === "host" ? state.hostHand : state.awayHand;
      return hand.length * scaling.multiplier;
    }
    case "spells_in_graveyard": {
      const gy = seat === "host" ? state.hostGraveyard : state.awayGraveyard;
      const spellCount = gy.filter(id => state.cardLookup[id]?.type === "spell").length;
      return spellCount * scaling.multiplier;
    }
    default:
      return scaling.multiplier;
  }
}
```

**Step 3: Implement modify_reputation handler**

```typescript
function executeModifyReputation(
  state: GameState,
  action: Extract<EffectAction, { type: "modify_reputation" }>,
  activatingPlayer: Seat
): EngineEvent[] {
  const targetSeat = action.target === "self" ? activatingPlayer : opponentSeat(activatingPlayer);
  let amount = action.amount;
  if (action.scaling) {
    amount = resolveScaling(state, activatingPlayer, action.scaling);
  }
  const current = targetSeat === "host" ? state.hostReputation : state.awayReputation;
  const newTotal = current + amount;
  return [{ type: "REPUTATION_CHANGED", seat: targetSeat, amount, newTotal }];
}
```

**Step 4: Implement modify_stability handler (same pattern)**

**Step 5: Implement scry handler**

```typescript
function executeScry(
  state: GameState,
  action: Extract<EffectAction, { type: "scry" }>,
  activatingPlayer: Seat
): EngineEvent[] {
  // Scry reveals top N cards — no state change in event-sourced model
  // (would need a CARDS_REVEALED event for the frontend)
  return [];
}
```

**Step 6: Implement random_discard handler**

```typescript
function executeRandomDiscard(
  state: GameState,
  action: Extract<EffectAction, { type: "random_discard" }>,
  activatingPlayer: Seat
): EngineEvent[] {
  const targetSeat = action.target === "opponent" ? opponentSeat(activatingPlayer) : activatingPlayer;
  const hand = targetSeat === "host" ? state.hostHand : state.awayHand;
  const count = Math.min(action.count, hand.length);
  // Pick from end of hand (shuffle would need RNG)
  const events: EngineEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({ type: "CARD_SENT_TO_GRAVEYARD", cardId: hand[hand.length - 1 - i], from: "hand" });
  }
  return events;
}
```

**Step 7: Add all new cases to executeAction switch**

**Step 8: Run tests**

```bash
cd /Users/home/Desktop/LTCG-v2 && bun run test:once --filter engine -- effects
```

**Step 9: Commit**

```bash
git add packages/engine/src/effects/operations.ts packages/engine/src/__tests__/effects.test.ts packages/engine/src/types/cards.ts
git commit -m "feat(engine): implement modify_reputation, modify_stability, scaling, scry, random_discard operations"
```

---

## Task 7: Fix Effect Parser — Reputation/Stability Mapping and Dropped Operations

**Files:**
- Modify: `packages/engine/src/effectParser.ts`
- Create: `packages/engine/src/__tests__/effectParser.test.ts`

**Step 1: Write failing tests for correct rep/stab mapping**

```typescript
it("maps 'MODIFY_STAT: reputation +500' to modify_reputation self +500", () => {
  const result = parseOperation("MODIFY_STAT: reputation +500");
  expect(result).toEqual({ type: "modify_reputation", amount: 500, target: "self" });
});

it("maps 'MODIFY_STAT: reputation -300 to opponent' to modify_reputation opponent -300", () => { ... });

it("maps 'MODIFY_STAT: stability +400' to modify_stability self +400", () => { ... });

it("maps 'MODIFY_STAT: reputation +200 per Dropout you control' with scaling", () => {
  const result = parseOperation("MODIFY_STAT: reputation +200 per Dropout you control");
  expect(result).toEqual({
    type: "modify_reputation",
    amount: 200,
    target: "self",
    scaling: { per: "controlled_archetype", archetype: "dropout", multiplier: 200 }
  });
});

it("maps MODIFY_COST to modify_cost action", () => { ... });
it("maps VIEW_TOP_CARDS to scry action", () => { ... });
it("maps REVEAL_HAND to reveal_hand action", () => { ... });
```

**Step 2: Rewrite parseModifyStat**

Replace the old boost_attack/boost_defense/damage mapping with modify_reputation/modify_stability:
```typescript
function parseModifyStat(op: string): EffectAction | undefined {
  const body = op.replace(/^(CONDITIONAL_|RANDOM_)?MODIFY_STAT:\s*/, "").trim();
  const isReputation = body.startsWith("reputation");
  const isStability = body.startsWith("stability");
  if (!isReputation && !isStability) return undefined;

  const rest = body.replace(/^(reputation|stability)\s*/, "").trim();
  const numMatch = rest.match(/^([+\-])(\d+)/);
  if (!numMatch) return undefined;

  const sign = numMatch[1];
  const amount = parseInt(numMatch[2], 10);
  const signedAmount = sign === "-" ? -amount : amount;

  // Determine target
  const hasToOpponent = /to opponent/i.test(rest);
  const hasToSelf = /to self/i.test(rest);
  const target = hasToOpponent ? "opponent" : "self";

  // Check for scaling
  const scalingMatch = rest.match(/per\s+(\w+)\s+you\s+control/i);
  const graveyardScaling = rest.match(/per\s+card\s+in\s+graveyard/i);
  const spellGYScaling = rest.match(/per\s+spell\s+in\s+graveyard/i);

  let scaling: ScalingDef | undefined;
  if (scalingMatch) {
    scaling = { per: "controlled_archetype", archetype: scalingMatch[1].toLowerCase(), multiplier: amount };
  } else if (graveyardScaling) {
    scaling = { per: "graveyard_cards", multiplier: amount };
  } else if (spellGYScaling) {
    scaling = { per: "spells_in_graveyard", multiplier: amount };
  }

  const type = isReputation ? "modify_reputation" : "modify_stability";
  return { type, amount: signedAmount, target, ...(scaling ? { scaling } : {}) } as EffectAction;
}
```

**Step 3: Implement previously-dropped operations**

Replace the `return undefined` block (lines 403-412) with actual parsers:

```typescript
if (trimmed.startsWith("MODIFY_COST:")) {
  const body = trimmed.replace(/^MODIFY_COST:\s*/, "").trim();
  const typeMatch = body.match(/^(spells?|traps?|stereotypes?)/i);
  const amountMatch = body.match(/([+\-])(\d+)/);
  const cardType = typeMatch ? (typeMatch[1].startsWith("spell") ? "spell" : typeMatch[1].startsWith("trap") ? "trap" : "stereotype") : "spell";
  const amount = amountMatch ? (amountMatch[1] === "-" ? -parseInt(amountMatch[2]) : parseInt(amountMatch[2])) : -1;
  return { type: "modify_cost", cardType, amount } as EffectAction;
}

if (trimmed.startsWith("VIEW_TOP_CARDS:")) {
  const numMatch = trimmed.match(/(\d+)/);
  return { type: "scry", count: numMatch ? parseInt(numMatch[1]) : 3 } as EffectAction;
}

if (trimmed.startsWith("REVEAL_HAND")) {
  return { type: "reveal_hand", target: "opponent" } as EffectAction;
}
```

**Step 4: Run tests**

```bash
cd /Users/home/Desktop/LTCG-v2 && bun run test:once --filter engine -- effectParser
```

**Step 5: Commit**

```bash
git add packages/engine/src/effectParser.ts packages/engine/src/__tests__/effectParser.test.ts
git commit -m "feat(engine): fix effect parser - reputation/stability mapping, scaling, dropped operations"
```

---

## Task 8: Rebalance Card Data — Costs, Stats, Vice Operations

**Files:**
- Modify: `convex/cardData.ts`

This is the largest task. It modifies 132 card definitions.

**Step 1: Update stereotype costs (clout costs)**

For each archetype's 5 stereotypes, assign costs: 2 at cost 1, 2 at cost 2, 1 at cost 3 (or 4 for boss).

Specific flagship reassignments:
| Card | Old Cost | New Cost |
|------|----------|----------|
| Crypto All-In Carl | 1 | 3 |
| Washed Varsity Legend | 2 | 4 |
| Afterparty Goblin | 2 | 3 |
| Test Curve Tyrant | 2 | 3 |
| Attendance Award Annie | 1 | 3 |
| Indie Dev Dropout | 1 | 3 |

All other stereotypes: assign cost 1 (level 4) or cost 2 (level 5-6) based on stats.

**Step 2: Rebalance stats (compress 22% gap to ~10%)**

Adjust per archetype:
- Dropouts: +90 total DEF (spread across 5 cards, ~+18 each)
- Geeks: +40 total (minor adjustments)
- Preps: -130 total (trim ATK/DEF on higher-stat cards)
- Nerds: -160 total (trim DEF on higher-stat cards)
- Goodies: -250 total DEF (trim DEF on all cards, ~-50 each)

**Step 3: Add vice counter operations to card abilities**

**Dropouts** (self-vice as cost): Add operations to stereotype abilities:
- Crypto All-In Carl: Add `"ADD_VICE: 1 to self"` to main phase ability
- Back Alley Bookie: Add `"ADD_VICE: 1 to self"` as cost for draw effect
- All-In Gamble (spell): Add `"ADD_VICE: 2 to self"` alongside reputation gain
- Loan Shark (spell): Add `"ADD_VICE: 1 to self"`

**Freaks** (opponent vice aggression): Add operations to abilities:
- Conspiracy Kyle: Change main phase to `"ADD_VICE: 1 to opponent"`
- Sudden Epiphany (spell): Add `"ADD_VICE: 1 to each opponent stereotype"`
- Underground Club (field): Add `"ADD_VICE: 1 to random opponent per turn"`
- Mood Swing (trap): Add `"ADD_VICE: 1 to attacker"`

**Preps** (redistribute): Add operations:
- Networking Event (spell): Add `"MOVE_VICE: 2 from self to opponent"`
- Screenshots Leaked (trap): Add `"MOVE_VICE: all from target to another"`

**Geeks** (convert to resources): Modify abilities:
- Debugging Dana: Change to `"REMOVE_COUNTERS: vice 1, DRAW: 1"`
- Code Refactor (spell): Change to `"REMOVE_COUNTERS: vice all, DRAW: equal to removed"`

**Nerds** (exploit presence): Add conditional operations:
- Spreadsheet Assassin: Add `"CONDITIONAL_DESTROY: 1 if target has vice"`
- Logical Fallacy (spell): Add `"MODIFY_STAT: reputation +200 per vice counter on field"`

**Goodies** — already have vice removal, no changes needed.

**Step 4: Update field spell targets per hate web**

Change these field spells' `operations` arrays:

| Field Spell | Change |
|-------------|--------|
| Back Alley Poker Night (Dropout) | Add: `"MODIFY_STAT: stability -200 to Freaks"` |
| College Campus (Prep) | Add: `"MODIFY_STAT: reputation -200 to Goodies"`, change cost modifier to `"MODIFY_COST: spells -1 (minimum 1)"` |
| LAN Arena (Geek) | Add: `"MODIFY_STAT: stability -200 to Nerds"` |
| Hackathon (Geek) | Add: `"MODIFY_STAT: stability -200 to Freaks"` |
| Street Art Alley (Freak) | Add: `"MODIFY_STAT: stability -200 to Nerds"`, change trap immunity to `"GRANT_IMMUNITY: normal_traps to Freaks"` |
| Debate Hall (Nerd) | Change: `"MODIFY_STAT: reputation -200 to Preps"` → `"MODIFY_STAT: reputation -200 to Goodies"` |
| Campus Lab (Nerd) | Add: `"MODIFY_STAT: stability -200 to Dropouts"` |
| Community Center (Goodie) | Change: `"MODIFY_STAT: reputation -100 to Freaks"` → `"MODIFY_STAT: reputation -100 to Geeks"` |

**Step 5: Fix power outliers**

- **College Campus**: Change `"MODIFY_COST: spells to 0"` → `"MODIFY_COST: spells -1 (minimum 1)"`
- **Party Queen Bri**: Change targets from `"allStereotypes"` → `"alliedStereotypes"` (Preps only)
- **Gas Station Mystic**: Change `"DISCARD: all"` → `"DISCARD: 2 random"`
- **Back Alley Bookie**: Remove trailing `?` from `"MODIFY_STAT: reputation -1000?"`

**Step 6: Commit**

```bash
git add convex/cardData.ts
git commit -m "feat(cards): rebalance costs, stats, vice operations, field spell targets, power outliers"
```

---

## Task 9: Update Integration Test — Full Game with New Resources

**Files:**
- Modify: `packages/engine/src/__tests__/integration.test.ts`

**Step 1: Update the "LP-zero win" test to "stability-zero win"**

Replace all `hostLifePoints`/`awayLifePoints` with `hostStability`/`awayStability`. Change `winReason` assertion from `"lp_zero"` to `"stability_zero"`. Update damage expectation (starting stability is 5000 not 8000, so fewer turns needed).

With ATK 2000 and starting stability 5000:
- Turn 1 (host): summon, can't attack
- Turn 2 (away): skip
- Turn 3 (host): attack → 3000 stability
- Turn 4 (away): skip
- Turn 5 (host): attack → 1000 stability
- Turn 6 (away): skip
- Turn 7 (host): attack → 0 stability → GAME_ENDED

**Step 2: Add new test for reputation win**

```typescript
it("wins via reputation reaching threshold", () => {
  // Create engine, manually give host reputation close to threshold
  // Play cards that grant reputation
  // Verify winReason is "reputation_max"
});
```

**Step 3: Add test for clout economy**

```typescript
it("enforces clout cost when summoning", () => {
  const engine = createEngine({ ... });
  // Turn 1: clout = 1, can only summon cost-1 cards
  // Try to summon cost-2 card, expect rejection
  // Summon cost-1 card, expect success
});
```

**Step 4: Run all tests**

```bash
cd /Users/home/Desktop/LTCG-v2 && bun run test:once --filter engine
```

**Step 5: Commit**

```bash
git add packages/engine/src/__tests__/integration.test.ts
git commit -m "test(engine): update integration tests for reputation/stability/clout system"
```

---

## Task 10: Fix Remaining Tests

**Files:**
- Modify: All test files in `packages/engine/src/__tests__/`

**Step 1: Update all test files that reference LP**

Search for `lifePoints`, `startingLP`, `lp_zero` across all test files and replace:
- `hostLifePoints` → `hostStability`
- `awayLifePoints` → `awayStability`
- `startingLP` → `startingStability`
- `lp_zero` → `stability_zero`
- Add `startingReputation`, `reputationToWin`, `maxCloutPerTurn` to any test configs
- Add `hostReputation`, `awayReputation`, `hostClout`, `awayClout`, `hostMaxClout`, `awayMaxClout` to test states

Files to update:
- `combat.test.ts`
- `phases.test.ts`
- `summoning.test.ts`
- `spellsTraps.test.ts`
- `stateBasedActions.test.ts`
- `vice.test.ts`
- `engine.test.ts`
- `effects.test.ts`
- `chain.test.ts`
- `position.test.ts`

**Step 2: Run full test suite**

```bash
cd /Users/home/Desktop/LTCG-v2 && bun run test:once --filter engine
```

Fix any remaining failures.

**Step 3: Commit**

```bash
git add packages/engine/src/__tests__/
git commit -m "test(engine): update all tests for new resource system"
```

---

## Task 11: Update Convex Backend — game.ts and Match Component

**Files:**
- Modify: `convex/game.ts`
- Modify: `packages/lunchtable-tcg-match/src/component/mutations.ts`

**Step 1: Update startStoryBattle config**

In `convex/game.ts`, update the `createInitialState` call to use new config:
```typescript
const config = {
  startingReputation: 0,
  reputationToWin: 10000,
  startingStability: 5000,
  maxCloutPerTurn: 4,
  // ... rest unchanged
};
```

**Step 2: Update getPlayerView to expose new fields**

The view JSON already serializes the full PlayerView, but the frontend will need to read the new field names (`reputation`, `stability`, `clout` instead of `lifePoints`).

**Step 3: Update executeAITurn to be non-trivial**

Replace the `END_TURN` only logic with basic heuristics using `legalMoves()`:
```typescript
const moves = legalMoves(currentState, aiSeat);
// Filter to meaningful moves (summon, attack, activate)
// Execute in priority: summon strongest affordable → activate spells → attack → end turn
```

**Step 4: Commit**

```bash
git add convex/game.ts packages/lunchtable-tcg-match/
git commit -m "feat(backend): update match creation and AI for new resource system"
```

---

## Task 12: Update Frontend PlayerView Usage

**Files:**
- Modify: `apps/web/src/pages/Play.tsx`

**Step 1: Replace LP display with Reputation/Stability/Clout**

Update the game board header to show:
- Reputation (with progress toward 10,000)
- Stability (with bar depleting from 5,000)
- Clout (current/max for the turn)

Replace all `lifePoints` / `opponentLifePoints` references.

**Step 2: Commit**

```bash
git add apps/web/src/pages/Play.tsx
git commit -m "feat(frontend): display reputation/stability/clout on game board"
```

---

## Execution Order & Dependencies

```
Task 1 (types) ──────────────────────────────────┐
                                                  ↓
Task 2 (engine core) ───────────────────────────────┐
                                                     ↓
Task 3 (combat) ──────┐                             │
Task 4 (summoning) ───┤ parallel after Task 2       │
Task 5 (state-based) ─┘                             │
                                                     ↓
Task 6 (new operations) ────────────────────────────┐
                                                     ↓
Task 7 (effect parser) ─────────────────────────────┐
                                                     ↓
Task 8 (card data) ─────────────────────────────────┐
                                                     ↓
Task 9 (integration test) ──────────────────────────┐
Task 10 (fix all tests) ───────────────────────────┐│
                                                    ↓↓
Task 11 (backend) ──────────────────────────────────┐
Task 12 (frontend) ────────────────────────────────┐│
                                                    ↓↓
                                                  DONE
```

Tasks 3, 4, 5 can run in parallel after Task 2.
Tasks 9, 10 can run in parallel.
Tasks 11, 12 can run in parallel.
