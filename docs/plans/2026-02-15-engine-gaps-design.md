# Engine Gap Resolution Design

Date: 2026-02-15

## Problem

The game engine's architecture (event-sourced, pure functions, zero deps) is solid, but 9 gaps prevent meaningful gameplay. Card effects are defined but never execute. AI agents can't enumerate valid moves. Several command handlers are missing.

## Gaps (by severity)

| # | Gap | Severity | Impact |
|---|-----|----------|--------|
| 1 | Card effects never execute | Critical | 132 cards of effect text is decorative |
| 2 | legalMoves() is a stub | Critical | AI agents can't enumerate valid actions |
| 3 | CHANGE_POSITION not implemented | High | Command exists but no handler |
| 4 | ACTIVATE_EFFECT not implemented | High | Monster ignition/trigger effects unusable |
| 5 | Chain system not implemented | High | Spell speed and response windows don't function |
| 6 | TemporaryModifier expiration | Medium | Modifiers stay forever |
| 7 | Shuffle not seeded | Medium | Breaks deterministic replay |
| 8 | No deck copy limits | Low | 40 copies of one card allowed |
| 9 | GAME_STARTED event missing | Low | Type exists but never emitted |

## Design Decisions

### Chain System: Simple (deferred full chains)
Traps auto-trigger when their condition is met during evolve(). No response windows. No CHAIN_RESPONSE command. Spell speed is tracked but not enforced. Full chain stack can be added later without breaking this API.

### Effect Resolution: Event-Hooked
After evolve() processes events, trigger detection scans for matching effects. Mandatory effects auto-fire. Optional effects (ignition) are surfaced via legalMoves() as ACTIVATE_EFFECT commands.

### Seeded RNG: Optional
Seed is optional in EngineOptions. When provided, uses mulberry32 PRNG. When absent, falls back to Math.random(). No breaking changes.

## Architecture

### New Files

**`packages/engine/src/rules/effects.ts`**
- `resolveEffectActions(state, seat, cardDef, effectIdx, targets): EngineEvent[]`
- Handles all 14 EffectAction types: draw, damage, heal, destroy, boost_attack, boost_defense, discard, add_vice, remove_vice, special_summon, banish, return_to_hand, negate, change_position
- `detectTriggers(state, seat, events): EngineEvent[]` - scans events for matching trigger conditions on board cards, spell/trap zone, field spells
- `resolveSpellEffect(state, seat, cardId): EngineEvent[]` - called from existing decideActivateSpell
- `resolveTrapEffect(state, seat, cardId): EngineEvent[]` - called from auto-trigger detection

**`packages/engine/src/rules/targeting.ts`**
- `selectTargets(state, seat, filter): string[]` - resolve TargetFilter to card IDs
- `validateTargets(state, seat, targets, filter): boolean` - verify target legality

**`packages/engine/src/__tests__/effects.test.ts`**
- Tests for each EffectAction type
- Trigger detection tests (on_summon, spell activation, etc.)
- OPT/HOPT enforcement tests
- Trap auto-trigger tests

### Modified Files

**`packages/engine/src/engine.ts`**
- `decide()`: Add CHANGE_POSITION and ACTIVATE_EFFECT handlers
- `evolve()`: After event processing, call detectTriggers() for auto-fire effects
- `legalMoves()`: Full enumeration (phase-gated)
- `createInitialState()`: Emit GAME_STARTED event
- `shuffle()`: Accept optional seeded PRNG

**`packages/engine/src/rules/stateBasedActions.ts`**
- End-of-turn: expire "turn" duration boosts, remove expired LingeringEffects

**`packages/engine/src/cards.ts`**
- `validateDeck()`: Add maxCopies constraint (default: 3)

## legalMoves() Enumeration

Phase-gated command generation:

| Phase | Available Commands |
|-------|-------------------|
| draw | ADVANCE_PHASE |
| standby | ADVANCE_PHASE |
| main, main2 | SUMMON, SET_MONSTER, FLIP_SUMMON, CHANGE_POSITION, SET_SPELL_TRAP, ACTIVATE_SPELL, ACTIVATE_EFFECT, ADVANCE_PHASE, END_TURN |
| combat | DECLARE_ATTACK, ADVANCE_PHASE |
| breakdown_check | ADVANCE_PHASE |
| end | (auto-advances) |
| All phases | SURRENDER |

Validation rules per command:
- SUMMON: hand has stereotype, level<=4 no tribute (or tributes available), !normalSummonedThisTurn, board<maxMonsters
- SET_MONSTER: same as SUMMON minus attack position
- FLIP_SUMMON: face-down defense monster, not summoned this turn
- CHANGE_POSITION: board monster, !changedPositionThisTurn, not face-down
- DECLARE_ATTACK: combat phase, canAttack, !hasAttackedThisTurn, turnNumber>1
- ACTIVATE_SPELL: spell in hand or face-down in zone
- ACTIVATE_EFFECT: monster on board with ignition effect, main phase, OPT not used
- SET_SPELL_TRAP: spell/trap in hand, zone<maxSpellTraps

## Effect Action Resolution

Each EffectAction maps to events:

| Action | Events Emitted |
|--------|---------------|
| draw | CARD_DRAWN x count |
| damage | LIFE_POINTS_CHANGED |
| heal | LIFE_POINTS_CHANGED |
| destroy | CARD_DESTROYED (reason: "effect") |
| boost_attack | STAT_MODIFIED (temporary or permanent) |
| boost_defense | STAT_MODIFIED |
| discard | CARD_SENT_TO_GRAVEYARD |
| add_vice | VICE_COUNTER_CHANGED |
| remove_vice | VICE_COUNTER_CHANGED |
| special_summon | MONSTER_SUMMONED (special) |
| banish | CARD_BANISHED |
| return_to_hand | CARD_RETURNED_TO_HAND |
| negate | EFFECT_NEGATED |
| change_position | POSITION_CHANGED |

## Trigger Detection Mapping

| Event | Triggers Checked |
|-------|-----------------|
| MONSTER_SUMMONED | on_summon (summoned card), OnOpponentStereotypeSummoned (opponent traps) |
| SPELL_ACTIVATED | OnSpellPlayed (board cards), OnOpponentSpellActivation (opponent traps) |
| ATTACK_DECLARED | OnAttackDeclaration (attacker), OnOpponentAttackDeclaration (opponent traps) |
| CARD_DESTROYED | OnDestroy (destroyed card if on board), OnCardDestroyed (other cards) |
| PHASE_CHANGED (draw) | OnDrawPhase, OnTurnStart (continuous effects) |
| LIFE_POINTS_CHANGED | OnStabilityBelowThreshold (if defense stat context) |

## Testing Strategy

Test incrementally per action type:
1. boost_attack / boost_defense (simplest, modifies board card stats)
2. draw / discard (hand manipulation)
3. damage / heal (LP changes)
4. destroy (card removal from board)
5. add_vice / remove_vice (counter manipulation)
6. Trigger detection (on_summon fires after summon)
7. Trap auto-trigger (opponent action triggers face-down trap)
8. OPT enforcement
9. Modifier expiration at end of turn
