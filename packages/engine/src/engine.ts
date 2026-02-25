import type { CardDefinition } from "./types/cards.js";
import type { Command } from "./types/commands.js";
import type { EngineEvent } from "./types/events.js";
import type {
  GameState,
  PlayerView,
  Seat,
  BoardCard,
  SpellTrapCard,
  LingeringEffect,
  CostModifier,
  TurnRestriction,
  TopDeckViewState,
} from "./types/state.js";
import type { EngineConfig } from "./types/config.js";
import { DEFAULT_CONFIG } from "./types/config.js";
import { nextPhase, opponentSeat } from "./rules/phases.js";
import { decideSummon, decideSetMonster, decideFlipSummon, evolveSummon } from "./rules/summoning.js";
import { decideSetSpellTrap, decideActivateSpell, decideActivateTrap, evolveSpellTrap } from "./rules/spellsTraps.js";
import { decideDeclareAttack, evolveCombat } from "./rules/combat.js";
import { evolveVice } from "./rules/vice.js";
import { checkStateBasedActions, drawCard } from "./rules/stateBasedActions.js";
import { decideChainResponse } from "./rules/chain.js";
import { resolveEffectActions, canActivateEffect, detectTriggerEffects, hasValidTargets, validateSelectedTargets, generateCostEvents } from "./rules/effects.js";
import { applyContinuousEffects, removeContinuousEffectsForSource } from "./rules/continuous.js";
import { expectDefined } from "./internal/invariant.js";
import {
  buildVisibleInstanceDefinitions,
  getCardDefinition,
  resolveDefinitionId,
} from "./instanceIds.js";

const assertNever = (value: never): never => {
  throw new Error(`Unreachable command/event: ${JSON.stringify(value)}`);
};

type TransferZone =
  | "board"
  | "hand"
  | "spell_trap_zone"
  | "field"
  | "graveyard"
  | "banished"
  | "deck";

function normalizeTransferZone(raw: unknown): TransferZone | null {
  if (typeof raw !== "string") return null;
  const zone = raw.trim();
  switch (zone) {
    case "board":
    case "hand":
    case "spell_trap_zone":
    case "field":
    case "graveyard":
    case "banished":
    case "deck":
      return zone;
    default:
      return null;
  }
}

function removeCardFromZoneForSeat(
  state: GameState,
  cardId: string,
  zone: TransferZone,
  seat: Seat
): { state: GameState; removed: boolean } {
  let next = { ...state };
  const isHost = seat === "host";
  const boardKey = isHost ? "hostBoard" : "awayBoard";
  const handKey = isHost ? "hostHand" : "awayHand";
  const graveyardKey = isHost ? "hostGraveyard" : "awayGraveyard";
  const banishedKey = isHost ? "hostBanished" : "awayBanished";
  const spellTrapKey = isHost ? "hostSpellTrapZone" : "awaySpellTrapZone";
  const fieldKey = isHost ? "hostFieldSpell" : "awayFieldSpell";
  const deckKey = isHost ? "hostDeck" : "awayDeck";

  if (zone === "board") {
    const board = [...(next as any)[boardKey]] as BoardCard[];
    const index = board.findIndex((c: BoardCard) => c.cardId === cardId);
    if (index < 0) return { state: next, removed: false };
    board.splice(index, 1);
    (next as any)[boardKey] = board;
    return { state: next, removed: true };
  }

  if (zone === "hand") {
    const hand = [...(next as any)[handKey]] as string[];
    const index = hand.indexOf(cardId);
    if (index < 0) return { state: next, removed: false };
    hand.splice(index, 1);
    (next as any)[handKey] = hand;
    return { state: next, removed: true };
  }

  if (zone === "graveyard") {
    const graveyard = [...(next as any)[graveyardKey]] as string[];
    const index = graveyard.indexOf(cardId);
    if (index < 0) return { state: next, removed: false };
    graveyard.splice(index, 1);
    (next as any)[graveyardKey] = graveyard;
    return { state: next, removed: true };
  }

  if (zone === "banished") {
    const banished = [...(next as any)[banishedKey]] as string[];
    const index = banished.indexOf(cardId);
    if (index < 0) return { state: next, removed: false };
    banished.splice(index, 1);
    (next as any)[banishedKey] = banished;
    return { state: next, removed: true };
  }

  if (zone === "spell_trap_zone") {
    const spellTrapZone = [...(next as any)[spellTrapKey]];
    const index = spellTrapZone.findIndex((c: SpellTrapCard) => c.cardId === cardId);
    if (index < 0) return { state: next, removed: false };
    spellTrapZone.splice(index, 1);
    (next as any)[spellTrapKey] = spellTrapZone;
    return { state: next, removed: true };
  }

  if (zone === "field") {
    if ((next as any)[fieldKey]?.cardId === cardId) {
      (next as any)[fieldKey] = null;
      return { state: next, removed: true };
    }
    return { state: next, removed: false };
  }

  if (zone === "deck") {
    const deck = [...(next as any)[deckKey]] as string[];
    const index = deck.indexOf(cardId);
    if (index < 0) return { state: next, removed: false };
    deck.splice(index, 1);
    (next as any)[deckKey] = deck;
    return { state: next, removed: true };
  }

  return { state: next, removed: false };
}

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

export interface Engine {
  getState(): GameState;
  mask(seat: Seat): PlayerView;
  legalMoves(seat: Seat): Command[];
  decide(command: Command, seat: Seat): EngineEvent[];
  evolve(events: EngineEvent[]): void;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

  return {
    getState: () => state,
    mask: (seat: Seat) => mask(state, seat),
    legalMoves: (seat: Seat) => legalMoves(state, seat),
    decide: (command: Command, seat: Seat) => decide(state, command, seat),
    evolve: (events: EngineEvent[]) => {
      state = evolve(state, events);
    },
  };
}

function shuffle<T>(arr: T[], rng?: () => number): T[] {
  const copy = [...arr];
  const random = rng ?? Math.random;
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const current = expectDefined(copy[i], `engine.shuffle missing value at index ${i}`);
    const target = expectDefined(copy[j], `engine.shuffle missing value at index ${j}`);
    copy[i] = target;
    copy[j] = current;
  }
  return copy;
}

type Board = GameState["hostBoard"];

function getBoard(
  state: GameState,
  side: "host" | "away"
): Board {
  return side === "host" ? state.hostBoard : state.awayBoard;
}

function setBoard(
  state: GameState,
  side: "host" | "away",
  board: Board
): GameState {
  return {
    ...state,
    [side === "host" ? "hostBoard" : "awayBoard"]: board,
  };
}

function getBoardAndIndexForCardId(
  state: GameState,
  cardId: string
): { side: "host" | "away"; index: number } | null {
  const hostIndex = state.hostBoard.findIndex((c) => c.cardId === cardId);
  if (hostIndex > -1) return { side: "host", index: hostIndex };

  const awayIndex = state.awayBoard.findIndex((c) => c.cardId === cardId);
  if (awayIndex > -1) return { side: "away", index: awayIndex };

  return null;
}

function applyTemporaryBoost(
  state: GameState,
  cardId: string,
  field: "attack" | "defense",
  amount: number
): GameState {
  const match = getBoardAndIndexForCardId(state, cardId);
  if (!match) return state;

  const board = [...getBoard(state, match.side)];
  const existing = board[match.index];
  if (!existing) return state;

  board[match.index] = {
    ...existing,
    temporaryBoosts: {
      ...existing.temporaryBoosts,
      [field]: existing.temporaryBoosts[field] + amount,
    },
  };

  return setBoard(state, match.side, board);
}

function cleanupTemporaryModifiers(
  state: GameState,
): {
  state: GameState;
  events: EngineEvent[];
} {
  const remainingModifiers: typeof state.temporaryModifiers = [];
  const expiredModifiers: typeof state.temporaryModifiers = [];

  for (const modifier of state.temporaryModifiers) {
    const shouldExpire =
      modifier.expiresOnTurn !== undefined && modifier.expiresOnTurn <= state.turnNumber;
    if (shouldExpire) {
      expiredModifiers.push(modifier);
      continue;
    }

    remainingModifiers.push(modifier);
  }

  let nextState = state;
  for (const expired of expiredModifiers) {
    nextState = applyTemporaryBoost(
      nextState,
      expired.cardId,
      expired.field,
      -expired.amount,
    );
  }

  if (expiredModifiers.length > 0) {
    nextState = {
      ...nextState,
      temporaryModifiers: remainingModifiers,
    };
  }

  const events: EngineEvent[] = expiredModifiers.map((modifier) => ({
    type: "MODIFIER_EXPIRED",
    cardId: modifier.cardId,
    source: modifier.source,
  }));
  return { state: nextState, events };
}

function modifierExpiresOnTurn(
  state: GameState,
  expiresAt: "end_of_turn" | "end_of_next_turn" | "permanent",
) {
  if (expiresAt === "permanent") {
    return undefined;
  }

  return expiresAt === "end_of_turn" ? state.turnNumber + 1 : state.turnNumber + 2;
}

function addTemporaryModifier(
  state: GameState,
  cardId: string,
  field: "attack" | "defense",
  amount: number,
  source: string,
  expiresAt: "end_of_turn" | "end_of_next_turn" | "permanent",
): GameState {
  return {
    ...state,
    temporaryModifiers: [
      ...state.temporaryModifiers,
      {
        cardId,
        field,
        amount,
        expiresAt,
        source,
        expiresOnTurn: modifierExpiresOnTurn(state, expiresAt),
      },
    ],
  };
}

function getCostModifiers(state: GameState): CostModifier[] {
  return state.costModifiers ?? [];
}

function getTurnRestrictions(state: GameState): TurnRestriction[] {
  return state.turnRestrictions ?? [];
}

function getTopDeckView(state: GameState): { host: TopDeckViewState | null; away: TopDeckViewState | null } {
  return state.topDeckView ?? { host: null, away: null };
}

function expiresOnTurn(state: GameState, durationTurns: number): number {
  return state.turnNumber + Math.max(1, durationTurns);
}

function cleanupRuleOverlays(state: GameState): GameState {
  const nextCostModifiers = getCostModifiers(state).filter((modifier) => modifier.expiresOnTurn > state.turnNumber);
  const nextRestrictions = getTurnRestrictions(state).filter((restriction) => restriction.expiresOnTurn > state.turnNumber);
  const topDeckView = getTopDeckView(state);
  const nextTopDeckView = {
    host: topDeckView.host && topDeckView.host.viewedAtTurn + 1 < state.turnNumber ? null : topDeckView.host,
    away: topDeckView.away && topDeckView.away.viewedAtTurn + 1 < state.turnNumber ? null : topDeckView.away,
  };

  return {
    ...state,
    costModifiers: nextCostModifiers,
    turnRestrictions: nextRestrictions,
    topDeckView: nextTopDeckView,
  };
}

function hasTurnRestriction(
  state: GameState,
  seat: Seat,
  restriction: TurnRestriction["restriction"],
): boolean {
  return getTurnRestrictions(state).some(
    (effect) =>
      effect.seat === seat &&
      effect.restriction === restriction &&
      effect.expiresOnTurn > state.turnNumber,
  );
}

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
  const instanceToDefinition: Record<string, string> = {};
  const hostDeckInstances = hostDeckIds.map((definitionId, index) => {
    const instanceId = `h:${index}:${definitionId}`;
    instanceToDefinition[instanceId] = definitionId;
    return instanceId;
  });
  const awayDeckInstances = awayDeckIds.map((definitionId, index) => {
    const instanceId = `a:${index}:${definitionId}`;
    instanceToDefinition[instanceId] = definitionId;
    return instanceId;
  });

  const hostDeck = shuffle(hostDeckInstances, rng);
  const awayDeck = shuffle(awayDeckInstances, rng);

  const hostHand = hostDeck.slice(0, config.startingHandSize);
  const hostDeckRemaining = hostDeck.slice(config.startingHandSize);

  const awayHand = awayDeck.slice(0, config.startingHandSize);
  const awayDeckRemaining = awayDeck.slice(config.startingHandSize);

  return {
    config,
    cardLookup,
    instanceToDefinition,
    hostId,
    awayId,
    hostHand,
    hostBoard: [],
    hostSpellTrapZone: [],
    hostFieldSpell: null,
    hostDeck: hostDeckRemaining,
    hostGraveyard: [],
    hostBanished: [],
    awayHand,
    awayBoard: [],
    awaySpellTrapZone: [],
    awayFieldSpell: null,
    awayDeck: awayDeckRemaining,
    awayGraveyard: [],
    awayBanished: [],
    hostLifePoints: config.startingLP,
    awayLifePoints: config.startingLP,
    hostBreakdownsCaused: 0,
    awayBreakdownsCaused: 0,
    currentTurnPlayer: firstPlayer,
    turnNumber: 1,
    currentPhase: "draw",
    hostNormalSummonedThisTurn: false,
    awayNormalSummonedThisTurn: false,
    currentChain: [],
    negatedLinks: [],
    currentPriorityPlayer: null,
    currentChainPasser: null,
    pendingAction: null,
    temporaryModifiers: [],
    lingeringEffects: [],
    optUsedThisTurn: [],
    hoptUsedEffects: [],
    winner: null,
    winReason: null,
    gameOver: false,
    gameStarted: true,
    pendingPong: null,
    pendingRedemption: null,
    redemptionUsed: { host: false, away: false },
    costModifiers: [],
    turnRestrictions: [],
    topDeckView: { host: null, away: null },
  };
}

function maskBoard(board: BoardCard[]): BoardCard[] {
  return board.map((card) => ({
    ...card,
    definitionId: card.faceDown ? "hidden" : card.definitionId,
  }));
}

function maskSpellTrapZone(zone: SpellTrapCard[]): SpellTrapCard[] {
  return zone.map((card) => ({
    ...card,
    definitionId: card.faceDown ? "hidden" : card.definitionId,
  }));
}

export function mask(state: GameState, seat: Seat): PlayerView {
  const isHost = seat === "host";

  const myHand = isHost ? state.hostHand : state.awayHand;
  const myBoard = isHost ? state.hostBoard : state.awayBoard;
  const mySpellTrapZone = isHost ? state.hostSpellTrapZone : state.awaySpellTrapZone;
  const myFieldSpell = isHost ? state.hostFieldSpell : state.awayFieldSpell;
  const myGraveyard = isHost ? state.hostGraveyard : state.awayGraveyard;
  const myBanished = isHost ? state.hostBanished : state.awayBanished;
  const myLifePoints = isHost ? state.hostLifePoints : state.awayLifePoints;
  const myDeckCount = isHost ? state.hostDeck.length : state.awayDeck.length;
  const myBreakdownsCaused = isHost ? state.hostBreakdownsCaused : state.awayBreakdownsCaused;
  const myNormalSummonedThisTurn = isHost
    ? state.hostNormalSummonedThisTurn
    : state.awayNormalSummonedThisTurn;

  const opponentHand = isHost ? state.awayHand : state.hostHand;
  const opponentBoard = isHost ? state.awayBoard : state.hostBoard;
  const opponentSpellTrapZone = isHost ? state.awaySpellTrapZone : state.hostSpellTrapZone;
  const opponentFieldSpell = isHost ? state.awayFieldSpell : state.hostFieldSpell;
  const opponentGraveyard = isHost ? state.awayGraveyard : state.hostGraveyard;
  const opponentBanished = isHost ? state.awayBanished : state.hostBanished;
  const opponentLifePoints = isHost ? state.awayLifePoints : state.hostLifePoints;
  const opponentDeckCount = isHost ? state.awayDeck.length : state.hostDeck.length;
  const opponentBreakdownsCaused = isHost ? state.awayBreakdownsCaused : state.hostBreakdownsCaused;
  const topDeckView = getTopDeckView(state);

  return {
    instanceDefinitions: buildVisibleInstanceDefinitions(state, seat),
    hand: myHand,
    board: myBoard,
    spellTrapZone: mySpellTrapZone,
    fieldSpell: myFieldSpell,
    graveyard: myGraveyard,
    banished: myBanished,
    lifePoints: myLifePoints,
    deckCount: myDeckCount,
    breakdownsCaused: myBreakdownsCaused,
    opponentHandCount: opponentHand.length,
    opponentBoard: maskBoard(opponentBoard),
    opponentSpellTrapZone: maskSpellTrapZone(opponentSpellTrapZone),
    opponentFieldSpell: opponentFieldSpell
      ? {
          ...opponentFieldSpell,
          definitionId: opponentFieldSpell.faceDown ? "hidden" : opponentFieldSpell.definitionId,
        }
      : null,
    opponentGraveyard,
    opponentBanished,
    opponentLifePoints,
    opponentDeckCount,
    opponentBreakdownsCaused,
    currentTurnPlayer: state.currentTurnPlayer,
    currentPriorityPlayer: state.currentPriorityPlayer,
    turnNumber: state.turnNumber,
    currentPhase: state.currentPhase,
    currentChain: state.currentChain,
    normalSummonedThisTurn: myNormalSummonedThisTurn,
    maxBoardSlots: state.config.maxBoardSlots,
    maxSpellTrapSlots: state.config.maxSpellTrapSlots,
    mySeat: seat,
    gameOver: state.gameOver,
    winner: state.winner,
    winReason: state.winReason,
    pendingPong: state.pendingPong,
    pendingRedemption: state.pendingRedemption,
    topDeckView: isHost ? topDeckView.host?.cardIds ?? null : topDeckView.away?.cardIds ?? null,
  };
}

export function legalMoves(state: GameState, seat: Seat): Command[] {
  if (state.gameOver) return [];

  // During pending pong, only the pong seat can act
  if (state.pendingPong) {
    if (state.pendingPong.seat !== seat) return [];
    return [
      { type: "PONG_SHOOT", destroyedCardId: state.pendingPong.destroyedCardId, result: "sink" },
      { type: "PONG_SHOOT", destroyedCardId: state.pendingPong.destroyedCardId, result: "miss" },
      { type: "PONG_DECLINE", destroyedCardId: state.pendingPong.destroyedCardId },
    ];
  }

  // During pending redemption, only the redemption seat can act
  if (state.pendingRedemption) {
    if (state.pendingRedemption.seat !== seat) return [];
    return [
      { type: "REDEMPTION_SHOOT", result: "sink" },
      { type: "REDEMPTION_SHOOT", result: "miss" },
      { type: "REDEMPTION_DECLINE" },
    ];
  }

  const isChainWindow = state.currentChain.length > 0;
  const isChainResponder = isChainWindow && state.currentPriorityPlayer === seat;
  const effectsDisabled = hasTurnRestriction(state, seat, "disable_effects");
  const attacksDisabled = hasTurnRestriction(state, seat, "disable_attacks");

  if (isChainWindow) {
    if (!isChainResponder) return [];
  } else if (state.currentTurnPlayer !== seat) {
    // During opponent's turn, check for set quick-play spells and set traps the player can activate
    if (effectsDisabled) return [];
    const opponentTurnMoves: Command[] = [];
    const playerSpellTrapZone = seat === "host"
      ? state.hostSpellTrapZone
      : state.awaySpellTrapZone;

    for (const setCard of playerSpellTrapZone) {
      if (!setCard.faceDown) continue;

      const setDef = state.cardLookup[setCard.definitionId];
      if (!setDef) continue;

      if (setDef.type === "spell" && setDef.spellType === "quick-play") {
        opponentTurnMoves.push({
          type: "ACTIVATE_SPELL",
          cardId: setCard.cardId,
        });
      }

      // Set traps can be activated during opponent's turn
      if (setDef.type === "trap") {
        opponentTurnMoves.push({
          type: "ACTIVATE_TRAP",
          cardId: setCard.cardId,
        });
      }
    }

    return opponentTurnMoves;
  }

  const moves: Command[] = [];

  if (isChainWindow) {
    if (!isChainResponder) return moves;
    moves.push({ type: "CHAIN_RESPONSE", pass: true });
    if (effectsDisabled) return moves;

    const responderTrapZone = seat === "host"
      ? state.hostSpellTrapZone
      : state.awaySpellTrapZone;

    for (const setCard of responderTrapZone) {
      if (!setCard.faceDown) continue;

      const setDef = state.cardLookup[setCard.definitionId];
      if (!setDef) continue;

      // Traps and set quick-play spells can respond in chain windows
      if (setDef.type === "trap") {
        moves.push({
          type: "CHAIN_RESPONSE",
          cardId: setCard.cardId,
          pass: false,
        });
      } else if (setDef.type === "spell" && setDef.spellType === "quick-play") {
        moves.push({
          type: "CHAIN_RESPONSE",
          cardId: setCard.cardId,
          pass: false,
        });
      }
    }

    return moves;
  }

  // Always allow ADVANCE_PHASE and END_TURN and SURRENDER
  moves.push({ type: "ADVANCE_PHASE" });
  moves.push({ type: "END_TURN" });
  moves.push({ type: "SURRENDER" });

  const isHost = seat === "host";
  const hand = isHost ? state.hostHand : state.awayHand;
  const board = isHost ? state.hostBoard : state.awayBoard;
  const spellTrapZone = isHost ? state.hostSpellTrapZone : state.awaySpellTrapZone;
  const opponentBoard = isHost ? state.awayBoard : state.hostBoard;
  const normalSummonedThisTurn = isHost ? state.hostNormalSummonedThisTurn : state.awayNormalSummonedThisTurn;

  // Main phase moves (main or main2)
  if (state.currentPhase === "main" || state.currentPhase === "main2") {
    // SUMMON and SET_MONSTER moves
    if (!normalSummonedThisTurn) {
      const hasBoardSpace = board.length < state.config.maxBoardSlots;
      const faceUpMonsters = board.filter((c) => !c.faceDown);

      for (const cardId of hand) {
        const card = getCardDefinition(state, cardId);
        if (!card || card.type !== "stereotype") continue;

        const level = card.level ?? 0;

        // Level 7+ requires 1 tribute. Tribute summons stay legal even when
        // board is full because the tribute frees a slot.
        if (level >= 7) {
          for (const tributeMonster of faceUpMonsters) {
            // SUMMON with tribute in attack position
            moves.push({
              type: "SUMMON",
              cardId,
              position: "attack",
              tributeCardIds: [tributeMonster.cardId],
            });
            // SUMMON with tribute in defense position
            moves.push({
              type: "SUMMON",
              cardId,
              position: "defense",
              tributeCardIds: [tributeMonster.cardId],
            });
          }
        } else {
          // Level 1-6: no tribute needed and requires open board space.
          if (hasBoardSpace) {
            // SUMMON in attack position
            moves.push({
              type: "SUMMON",
              cardId,
              position: "attack",
            });
            // SUMMON in defense position
            moves.push({
              type: "SUMMON",
              cardId,
              position: "defense",
            });
          }
        }

        if (hasBoardSpace) {
          // SET_MONSTER (face-down defense)
          moves.push({
            type: "SET_MONSTER",
            cardId,
          });
        }
      }
    }

    // FLIP_SUMMON moves
    for (const boardCard of board) {
      if (boardCard.faceDown && boardCard.turnSummoned < state.turnNumber) {
        moves.push({
          type: "FLIP_SUMMON",
          cardId: boardCard.cardId,
        });
      }
    }

    // SET_SPELL_TRAP moves
    if (spellTrapZone.length < state.config.maxSpellTrapSlots) {
      for (const cardId of hand) {
        const card = getCardDefinition(state, cardId);
        if (!card || (card.type !== "spell" && card.type !== "trap")) continue;

        moves.push({
          type: "SET_SPELL_TRAP",
          cardId,
        });
      }
    }

    // ACTIVATE_SPELL moves (from hand or face-down set spells)
    if (!effectsDisabled) {
      for (const cardId of hand) {
        const card = getCardDefinition(state, cardId);
        if (!card || card.type !== "spell") continue;

      // Check if we have room in spell/trap zone (unless it's a field spell)
      if (card.spellType !== "field" && spellTrapZone.length >= state.config.maxSpellTrapSlots) {
        continue;
      }

      // Equip spells: must have a face-up monster on own board
      if (card.spellType === "equip") {
        const faceUpMonsters = board.filter((c) => !c.faceDown);
        if (faceUpMonsters.length === 0) continue;

        // Generate one move per possible target
        for (const monster of faceUpMonsters) {
          moves.push({
            type: "ACTIVATE_SPELL",
            cardId,
            targets: [monster.cardId],
          });
        }
        continue;
      }

      // Ritual spells: check if player has ritual spell + monster in hand + enough tributes
      if (card.spellType === "ritual") {
        // Need at least one monster in hand that could be ritual summoned
        const monstersInHand = hand.filter((hId) => {
          if (hId === cardId) return false; // Skip the ritual spell itself
          const def = getCardDefinition(state, hId);
          return def && def.type === "stereotype";
        });
        if (monstersInHand.length === 0) continue;

        // Need at least one face-up monster on board as tribute
        const faceUpMonsters = board.filter((c) => !c.faceDown);
        if (faceUpMonsters.length === 0) continue;

        // Check if any combination is possible (at least one monster whose
        // level can be met by available tributes)
        const totalTributeLevel = faceUpMonsters.reduce((sum, c) => {
          const def = state.cardLookup[c.definitionId];
          return sum + (def?.level ?? 0);
        }, 0);

        const hasValidRitual = monstersInHand.some((mId) => {
          const mDef = getCardDefinition(state, mId);
          return mDef && (mDef.level ?? 0) <= totalTributeLevel;
        });

        if (!hasValidRitual) continue;

        // Don't enumerate all combinations - just indicate activation is possible
        moves.push({
          type: "ACTIVATE_SPELL",
          cardId,
        });
        continue;
      }

      // Check target availability for the spell's first effect
      if (card.effects && card.effects.length > 0) {
        const eff = card.effects[0];
        if (eff && !hasValidTargets(state, eff, seat)) continue;
      }

        moves.push({
          type: "ACTIVATE_SPELL",
          cardId,
        });
      }

      // ACTIVATE_SPELL for face-down set spells
      for (const setCard of spellTrapZone) {
        if (!setCard.faceDown) continue;

        const card = state.cardLookup[setCard.definitionId];
        if (!card || card.type !== "spell") continue;

        // Equip spells from spell/trap zone: must have face-up monster
        if (card.spellType === "equip") {
          const faceUpMonsters = board.filter((c) => !c.faceDown);
          if (faceUpMonsters.length === 0) continue;

          for (const monster of faceUpMonsters) {
            moves.push({
              type: "ACTIVATE_SPELL",
              cardId: setCard.cardId,
              targets: [monster.cardId],
            });
          }
          continue;
        }

        // Check target availability for the spell's first effect
        if (card.effects && card.effects.length > 0) {
          const eff = card.effects[0];
          if (eff && !hasValidTargets(state, eff, seat)) continue;
        }

        moves.push({
          type: "ACTIVATE_SPELL",
          cardId: setCard.cardId,
        });
      }

      // ACTIVATE_TRAP moves (face-down set traps only)
      for (const setCard of spellTrapZone) {
        if (!setCard.faceDown) continue;

        const card = state.cardLookup[setCard.definitionId];
        if (!card || card.type !== "trap") continue;

        // Check target availability for the trap's first effect
        if (card.effects && card.effects.length > 0) {
          const eff = card.effects[0];
          if (eff && !hasValidTargets(state, eff, seat)) continue;
        }

        moves.push({
          type: "ACTIVATE_TRAP",
          cardId: setCard.cardId,
        });
      }

      // ACTIVATE_EFFECT moves (face-up monsters with ignition effects)
      for (const boardCard of board) {
        if (boardCard.faceDown) continue;
        const cardDef = state.cardLookup[boardCard.definitionId];
        if (!cardDef?.effects) continue;

        for (let i = 0; i < cardDef.effects.length; i++) {
          const eff = cardDef.effects[i];
          if (eff.type !== "ignition") continue;
          if (!canActivateEffect(state, eff, seat, boardCard.cardId)) continue;
          if (!hasValidTargets(state, eff, seat)) continue;

          moves.push({
            type: "ACTIVATE_EFFECT",
            cardId: boardCard.cardId,
            effectIndex: i,
          });
        }
      }
    }
  }

  // Combat phase moves
  if (state.currentPhase === "combat") {
    if (attacksDisabled) {
      return moves;
    }
    // DECLARE_ATTACK moves
    if (state.turnNumber > 1) {
      const faceUpOpponentMonsters = opponentBoard.filter((c) => !c.faceDown);

      for (const boardCard of board) {
        // Must be face-up, can attack, and hasn't attacked this turn
        if (boardCard.faceDown || !boardCard.canAttack || boardCard.hasAttackedThisTurn) {
          continue;
        }

        // Can attack each opponent monster
        for (const opponentMonster of opponentBoard) {
          moves.push({
            type: "DECLARE_ATTACK",
            attackerId: boardCard.cardId,
            targetId: opponentMonster.cardId,
          });
        }

        // Can direct attack if opponent has no face-up monsters
        if (faceUpOpponentMonsters.length === 0) {
          moves.push({
            type: "DECLARE_ATTACK",
            attackerId: boardCard.cardId,
          });
        }
      }
    }
  }

  return moves;
}

export function decide(state: GameState, command: Command, seat: Seat): EngineEvent[] {
  if (state.gameOver) return [];
  const effectsDisabled = hasTurnRestriction(state, seat, "disable_effects");

  // SURRENDER is always allowed regardless of turn or chain state.
  if (command.type !== "SURRENDER") {
    const chainInProgress = state.currentChain.length > 0;
    if (chainInProgress) {
      if (command.type !== "CHAIN_RESPONSE" || state.currentPriorityPlayer !== seat) {
        return [];
      }
      if (effectsDisabled && command.cardId) {
        return [];
      }
    } else if (state.currentTurnPlayer !== seat) {
      if (effectsDisabled) return [];
      // Allow set quick-play spell activation during opponent's turn
      if (command.type === "ACTIVATE_SPELL") {
        const playerSpellTrapZone = seat === "host" ? state.hostSpellTrapZone : state.awaySpellTrapZone;
        const setCard = playerSpellTrapZone.find((c) => c.cardId === command.cardId);
        if (!setCard || !setCard.faceDown) return [];
        const cardDef = state.cardLookup[setCard.definitionId];
        if (!cardDef || cardDef.type !== "spell" || cardDef.spellType !== "quick-play") return [];
        // Allowed — fall through to ACTIVATE_SPELL handler
      } else if (command.type === "ACTIVATE_TRAP") {
        // Allow set trap activation during opponent's turn
        const playerSpellTrapZone = seat === "host" ? state.hostSpellTrapZone : state.awaySpellTrapZone;
        const setCard = playerSpellTrapZone.find((c) => c.cardId === command.cardId);
        if (!setCard || !setCard.faceDown) return [];
        const cardDef = state.cardLookup[setCard.definitionId];
        if (!cardDef || cardDef.type !== "trap") return [];
        // Allowed — fall through to ACTIVATE_TRAP handler
      } else {
        return [];
      }
    }
  }

  if (effectsDisabled) {
    if (
      command.type === "ACTIVATE_SPELL" ||
      command.type === "ACTIVATE_TRAP" ||
      command.type === "ACTIVATE_EFFECT"
    ) {
      return [];
    }
  }

  const events: EngineEvent[] = [];

  switch (command.type) {
    case "ADVANCE_PHASE": {
      const from = state.currentPhase;
      if (from === "end") {
        events.push({ type: "TURN_ENDED", seat });
        const expiredKeys = new Set<string>();
        for (const modifier of state.temporaryModifiers.filter((m) => m.expiresAt === "end_of_turn")) {
          const key = `${modifier.cardId}|${modifier.source}`;
          if (expiredKeys.has(key)) continue;
          expiredKeys.add(key);
          events.push({
            type: "MODIFIER_EXPIRED",
            cardId: modifier.cardId,
            source: modifier.source,
          });
        }
        const nextSeat = opponentSeat(seat);
        events.push({ type: "TURN_STARTED", seat: nextSeat, turnNumber: state.turnNumber + 1 });
        break;
      }

      let to = nextPhase(from);
      if (
        to === "combat" &&
        hasTurnRestriction(state, state.currentTurnPlayer, "disable_battle_phase")
      ) {
        to = nextPhase("combat");
      }
      events.push({ type: "PHASE_CHANGED", from, to });

      // When transitioning from draw phase, current player draws a card
      if (
        from === "draw" &&
        to === "standby" &&
        !hasTurnRestriction(state, state.currentTurnPlayer, "disable_draw_phase")
      ) {
        events.push(...drawCard(state, state.currentTurnPlayer));
      }

      // When entering standby phase, re-check continuous/field effects
      if (to === "standby") {
        // We need the state after the draw to properly compute effects.
        // applyContinuousEffects works on the current state, but since
        // evolve() will process these events in order, we compute against
        // the pre-draw state. The evolve() post-processing will pick up
        // any newly summoned monsters later.
        events.push(...applyContinuousEffects(state));
      }
      break;
    }

    case "END_TURN": {
      // END_TURN can only close a turn from the end phase.
      // Outside end phase, treat it as phase advancement.
      if (state.currentPhase !== "end") {
        return decide(state, { type: "ADVANCE_PHASE" }, seat);
      }
      events.push({ type: "TURN_ENDED", seat });
      const nextSeat = opponentSeat(seat);
      events.push({ type: "TURN_STARTED", seat: nextSeat, turnNumber: state.turnNumber + 1 });
      break;
    }

    case "SURRENDER": {
      const winner = opponentSeat(seat);
      events.push({ type: "GAME_ENDED", winner, reason: "surrender" });
      break;
    }

    case "SUMMON": {
      events.push(...decideSummon(state, seat, command));
      break;
    }

    case "SET_MONSTER": {
      events.push(...decideSetMonster(state, seat, command));
      break;
    }

    case "FLIP_SUMMON": {
      events.push(...decideFlipSummon(state, seat, command));
      break;
    }

    case "SET_SPELL_TRAP": {
      events.push(...decideSetSpellTrap(state, seat, command));
      break;
    }

    case "ACTIVATE_SPELL": {
      events.push(...decideActivateSpell(state, seat, command));
      break;
    }

    case "ACTIVATE_TRAP": {
      events.push(...decideActivateTrap(state, seat, command));
      break;
    }

    case "DECLARE_ATTACK": {
      if (hasTurnRestriction(state, seat, "disable_attacks")) break;
      events.push(...decideDeclareAttack(state, seat, command));
      break;
    }

    case "CHAIN_RESPONSE": {
      events.push(...decideChainResponse(state, seat, command));
      break;
    }

    case "ACTIVATE_EFFECT": {
      const { cardId, effectIndex, targets = [] } = command;
      // Must be main phase for ignition effects
      if (state.currentPhase !== "main" && state.currentPhase !== "main2") break;

      // Find the card on the player's board
      const playerBoard = seat === "host" ? state.hostBoard : state.awayBoard;
      const boardCard = playerBoard.find((c) => c.cardId === cardId);
      if (!boardCard) break;
      if (boardCard.faceDown) break;

      // Get card definition (use definitionId for consistency with other board card lookups)
      const cardDef = state.cardLookup[boardCard.definitionId];
      if (!cardDef || !cardDef.effects || effectIndex < 0 || effectIndex >= cardDef.effects.length) break;

      const effectDef = expectDefined(
        cardDef.effects[effectIndex],
        "engine.decide ACTIVATE_EFFECT missing effect after bounds check"
      );
      if (effectDef.type !== "ignition") break;

      // Check OPT/HOPT and cost requirements
      if (!canActivateEffect(state, effectDef, seat, cardId)) break;

      // Check that enough valid targets exist for the effect
      if (!hasValidTargets(state, effectDef, seat)) break;

      // If targets are provided and the effect has a targetFilter, validate them
      if (targets.length > 0 && !validateSelectedTargets(state, effectDef, seat, targets)) break;

      // Generate cost payment events BEFORE the effect resolves
      if (effectDef.cost) {
        events.push(...generateCostEvents(state, effectDef.cost, seat, cardId));
      }

      // Emit EFFECT_ACTIVATED
      events.push({
        type: "EFFECT_ACTIVATED",
        seat,
        cardId,
        effectIndex,
        targets,
      });

      // Resolve the effect's actions
      events.push(...resolveEffectActions(state, seat, effectDef.actions, cardId, targets));
      break;
    }

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

    case "PONG_SHOOT": {
      if (!state.pendingPong || state.pendingPong.seat !== seat) break;
      if (state.pendingPong.destroyedCardId !== command.destroyedCardId) break;
      events.push({
        type: "PONG_ATTEMPTED",
        seat,
        destroyedCardId: command.destroyedCardId,
        result: command.result,
      });
      if (command.result === "sink") {
        // Move card from graveyard to banished
        const ownerSeat = opponentSeat(seat);
        events.push({
          type: "CARD_BANISHED",
          cardId: command.destroyedCardId,
          from: "graveyard",
          sourceSeat: ownerSeat,
        });
      }
      break;
    }

    case "PONG_DECLINE": {
      if (!state.pendingPong || state.pendingPong.seat !== seat) break;
      if (state.pendingPong.destroyedCardId !== command.destroyedCardId) break;
      events.push({
        type: "PONG_DECLINED",
        seat,
        destroyedCardId: command.destroyedCardId,
      });
      break;
    }

    case "REDEMPTION_SHOOT": {
      if (!state.pendingRedemption || state.pendingRedemption.seat !== seat) break;
      events.push({
        type: "REDEMPTION_ATTEMPTED",
        seat,
        result: command.result,
      });
      if (command.result === "sink") {
        events.push({
          type: "REDEMPTION_GRANTED",
          seat,
          newLP: state.config.redemptionLP,
        });
      } else {
        // Miss — game ends. Re-emit the GAME_ENDED event
        events.push({
          type: "GAME_ENDED",
          winner: opponentSeat(seat),
          reason: "lp_zero",
        });
      }
      break;
    }

    case "REDEMPTION_DECLINE": {
      if (!state.pendingRedemption || state.pendingRedemption.seat !== seat) break;
      const winner = opponentSeat(seat);
      events.push({
        type: "GAME_ENDED",
        winner,
        reason: "lp_zero",
      });
      break;
    }

    default:
      assertNever(command);
  }

  return events;
}

export interface EvolveOptions {
  skipDerivedChecks?: boolean;
}

export function evolve(
  state: GameState,
  events: EngineEvent[],
  options?: EvolveOptions,
): GameState {
  let newState = { ...state };
  const skipDerivedChecks = options?.skipDerivedChecks ?? false;

  for (const event of events) {
    switch (event.type) {
      case "PHASE_CHANGED":
        newState.currentPhase = event.to;
        break;

      case "TURN_STARTED":
        newState.currentTurnPlayer = event.seat;
        newState.turnNumber = event.turnNumber;
        newState.currentPhase = "draw";
        // Reset per-turn flags
        newState.hostNormalSummonedThisTurn = false;
        newState.awayNormalSummonedThisTurn = false;
        newState.optUsedThisTurn = [];
        // Temporary modifiers from the previous turn should expire now.
        const cleanup = cleanupTemporaryModifiers(newState);
        newState = cleanup.state;
        newState = cleanupRuleOverlays(newState);
        // Reset combat flags for the new turn player's monsters
        if (event.seat === "host") {
          newState.hostBoard = newState.hostBoard.map((c) => ({
            ...c,
            canAttack: true,
            hasAttackedThisTurn: false,
            changedPositionThisTurn: false,
          }));
        } else {
          newState.awayBoard = newState.awayBoard.map((c) => ({
            ...c,
            canAttack: true,
            hasAttackedThisTurn: false,
            changedPositionThisTurn: false,
          }));
        }
        break;

      case "TURN_ENDED":
        // Minimal - the TURN_STARTED event handles the actual state change
        break;

      case "GAME_ENDED":
        newState.gameOver = true;
        newState.winner = event.winner;
        newState.winReason = event.reason;
        break;

      case "MONSTER_SUMMONED":
      case "MONSTER_SET":
      case "FLIP_SUMMONED":
        newState = evolveSummon(newState, event);
        break;

      case "SPELL_TRAP_SET":
      case "SPELL_ACTIVATED":
      case "TRAP_ACTIVATED":
      case "SPELL_EQUIPPED":
        newState = evolveSpellTrap(newState, event);
        break;

      case "CARD_SENT_TO_GRAVEYARD":
        // Both summoning and spellsTraps can handle this event
        newState = evolveSummon(newState, event);
        newState = evolveSpellTrap(newState, event);
        break;

      case "ATTACK_DECLARED":
      case "DAMAGE_DEALT":
      case "CARD_DESTROYED":
      case "BATTLE_RESOLVED":
        newState = evolveCombat(newState, event);
        break;

      case "VICE_COUNTER_ADDED":
      case "VICE_COUNTER_REMOVED":
      case "BREAKDOWN_TRIGGERED":
        newState = evolveVice(newState, event);
        break;

      case "CARD_DRAWN": {
        const { seat, cardId } = event;
        if (seat === "host") {
          newState.hostDeck = newState.hostDeck.slice(1); // Remove top card from deck
          newState.hostHand = [...newState.hostHand, cardId]; // Add to hand
        } else {
          newState.awayDeck = newState.awayDeck.slice(1);
          newState.awayHand = [...newState.awayHand, cardId];
        }
        break;
      }

      case "DECK_OUT": {
        const { seat } = event;
        const winner = opponentSeat(seat);
        newState.gameOver = true;
        newState.winner = winner;
        newState.winReason = "deck_out";
        break;
      }

      case "MODIFIER_APPLIED": {
        const { cardId, field, amount, source, expiresAt } = event;
        newState = applyTemporaryBoost(newState, cardId, field, amount);
        newState = addTemporaryModifier(newState, cardId, field, amount, source, expiresAt);
        break;
      }

      case "CARD_BANISHED": {
        const { cardId, from, sourceSeat } = event;
        const normalizedFrom = normalizeTransferZone(from === "spellTrapZone" ? "spell_trap_zone" : from);
        if (!normalizedFrom) break;

        const removeToBanished = (seat: Seat): boolean => {
          const seatState = removeCardFromZoneForSeat(newState, cardId, normalizedFrom, seat);
          if (!seatState.removed) return false;
          newState = seatState.state;

          if (seat === "host") {
            newState.hostBanished = [...newState.hostBanished, cardId];
          } else {
            newState.awayBanished = [...newState.awayBanished, cardId];
          }
          return true;
        };

        if (sourceSeat) {
          removeToBanished(sourceSeat);
        } else if (!removeToBanished("host")) {
          removeToBanished("away");
        }
        break;
      }

      case "CARD_RETURNED_TO_HAND": {
        const { cardId, from, sourceSeat } = event;
        const normalizedFrom = normalizeTransferZone(from === "spellTrapZone" ? "spell_trap_zone" : from);
        if (!normalizedFrom) break;

        const removeToHand = (seat: Seat): boolean => {
          const seatState = removeCardFromZoneForSeat(newState, cardId, normalizedFrom, seat);
          if (!seatState.removed) return false;
          newState = seatState.state;

          if (seat === "host") {
            newState.hostHand = [...newState.hostHand, cardId];
          } else {
            newState.awayHand = [...newState.awayHand, cardId];
          }
          return true;
        };

        if (sourceSeat) {
          removeToHand(sourceSeat);
        } else if (!removeToHand("host")) {
          removeToHand("away");
        }
        break;
      }

      case "SPECIAL_SUMMONED": {
        const { cardId, from, seat } = event;
        const normalizedFrom = from === "spellTrapZone" ? "spell_trap_zone" : from;

        const removeFromZone = (owner: Seat) => {
          const isHost = owner === "host";
          const boardKey = isHost ? "hostBoard" : "awayBoard";
          const handKey = isHost ? "hostHand" : "awayHand";
          const graveyardKey = isHost ? "hostGraveyard" : "awayGraveyard";
          const banishedKey = isHost ? "hostBanished" : "awayBanished";
          const spellTrapKey = isHost ? "hostSpellTrapZone" : "awaySpellTrapZone";
          const fieldKey = isHost ? "hostFieldSpell" : "awayFieldSpell";
          const deckKey = isHost ? "hostDeck" : "awayDeck";

          let removed = false;
          if (normalizedFrom === "board") {
            const board = [...(newState as any)[boardKey]];
            const index = board.findIndex((c: any) => c.cardId === cardId);
            if (index > -1) {
              board.splice(index, 1);
              (newState as any)[boardKey] = board;
              removed = true;
            }
          } else if (normalizedFrom === "hand") {
            const hand = [...(newState as any)[handKey]];
            const index = hand.indexOf(cardId);
            if (index > -1) {
              hand.splice(index, 1);
              (newState as any)[handKey] = hand;
              removed = true;
            }
          } else if (normalizedFrom === "graveyard") {
            const graveyard = [...(newState as any)[graveyardKey]];
            const index = graveyard.indexOf(cardId);
            if (index > -1) {
              graveyard.splice(index, 1);
              (newState as any)[graveyardKey] = graveyard;
              removed = true;
            }
          } else if (normalizedFrom === "spell_trap_zone") {
            const spellTrapZone = [...(newState as any)[spellTrapKey]];
            const index = spellTrapZone.findIndex((c: any) => c.cardId === cardId);
            if (index > -1) {
              spellTrapZone.splice(index, 1);
              (newState as any)[spellTrapKey] = spellTrapZone;
              removed = true;
            }
          } else if (normalizedFrom === "field") {
            if ((newState as any)[fieldKey]?.cardId === cardId) {
              (newState as any)[fieldKey] = null;
              removed = true;
            }
          } else if (normalizedFrom === "banished") {
            const banished = [...(newState as any)[banishedKey]];
            const index = banished.indexOf(cardId);
            if (index > -1) {
              banished.splice(index, 1);
              (newState as any)[banishedKey] = banished;
              removed = true;
            }
          } else if (normalizedFrom === "deck") {
            const deck = [...(newState as any)[deckKey]];
            const index = deck.indexOf(cardId);
            if (index > -1) {
              deck.splice(index, 1);
              (newState as any)[deckKey] = deck;
              removed = true;
            }
          }

          return removed;
        };

        if (!removeFromZone("host") && !removeFromZone("away")) {
          break;
        }

        const newCard: BoardCard = {
          cardId,
          definitionId: resolveDefinitionId(newState, cardId),
          position: event.position,
          faceDown: false,
          canAttack: false,
          hasAttackedThisTurn: false,
          changedPositionThisTurn: false,
          viceCounters: 0,
          temporaryBoosts: { attack: 0, defense: 0 },
          equippedCards: [],
          turnSummoned: newState.turnNumber,
        };

        if (seat === "host") {
          newState.hostBoard = [...newState.hostBoard, newCard];
        } else {
          newState.awayBoard = [...newState.awayBoard, newCard];
        }
        break;
      }

      case "CHAIN_STARTED": {
        newState.currentChain = [];
        newState.negatedLinks = [];
        newState.currentChainPasser = null;
        newState.currentPriorityPlayer = null;
        break;
      }

      case "CHAIN_LINK_ADDED": {
        const { cardId, seat, effectIndex, targets = [] } = event;
        newState.currentChain = [...newState.currentChain, {
          cardId, activatingPlayer: seat, effectIndex, targets,
        }];
        newState.currentPriorityPlayer = opponentSeat(seat);
        newState.currentChainPasser = null;
        break;
      }

      case "CHAIN_LINK_NEGATED": {
        const { negatedLinkIndex } = event;
        if (!newState.negatedLinks.includes(negatedLinkIndex)) {
          newState.negatedLinks = [...newState.negatedLinks, negatedLinkIndex];
        }
        break;
      }

      case "CHAIN_RESOLVED": {
        newState.currentChain = [];
        newState.negatedLinks = [];
        newState.currentChainPasser = null;
        newState.currentPriorityPlayer = null;
        break;
      }

      case "CHAIN_PASSED": {
        if (newState.currentChain.length > 0) {
          newState.currentChainPasser = event.seat;
          newState.currentPriorityPlayer = opponentSeat(event.seat);
        }
        break;
      }

      case "EFFECT_ACTIVATED": {
        const { effectIndex, cardId } = event;
        const cardDef = getCardDefinition(newState, cardId);
        const eff = cardDef?.effects?.[effectIndex];
        if (!eff) break;

        if (eff.oncePerTurn) {
          newState.optUsedThisTurn = [...newState.optUsedThisTurn, eff.id];
        }
        if (eff.hardOncePerTurn) {
          newState.hoptUsedEffects = [...newState.hoptUsedEffects, eff.id];
        }
        break;
      }

      case "POSITION_CHANGED": {
        const { cardId, to } = event;
        for (const boardKey of ["hostBoard", "awayBoard"] as const) {
          const board = [...newState[boardKey]];
          const idx = board.findIndex((c) => c.cardId === cardId);
          if (idx > -1) {
            const existingCard = expectDefined(
              board[idx],
              `engine.evolve POSITION_CHANGED missing board card at index ${idx}`
            );
            board[idx] = { ...existingCard, position: to, changedPositionThisTurn: true };
            newState[boardKey] = board;
            break;
          }
        }
        break;
      }

      case "MODIFIER_EXPIRED":
        break;

      case "COST_MODIFIER_APPLIED": {
        const costModifier: CostModifier = {
          seat: event.seat,
          cardType: event.cardType,
          operation: event.operation,
          amount: event.amount,
          sourceCardId: event.sourceCardId,
          expiresOnTurn: expiresOnTurn(newState, event.durationTurns),
        };
        newState = {
          ...newState,
          costModifiers: [...getCostModifiers(newState), costModifier],
        };
        break;
      }

      case "TURN_RESTRICTION_APPLIED": {
        const restriction: TurnRestriction = {
          seat: event.seat,
          restriction: event.restriction,
          sourceCardId: event.sourceCardId,
          expiresOnTurn: expiresOnTurn(newState, event.durationTurns),
        };
        newState = {
          ...newState,
          turnRestrictions: [...getTurnRestrictions(newState), restriction],
        };
        break;
      }

      case "TOP_CARDS_VIEWED": {
        const topDeckView = getTopDeckView(newState);
        const nextTopDeckView = {
          ...topDeckView,
          [event.seat]: {
            cardIds: [...event.cardIds],
            sourceCardId: event.sourceCardId,
            viewedAtTurn: newState.turnNumber,
          },
        };
        newState = {
          ...newState,
          topDeckView: nextTopDeckView,
        };
        break;
      }

      case "TOP_CARDS_REARRANGED": {
        const deckKey = event.seat === "host" ? "hostDeck" : "awayDeck";
        const currentDeck = [...newState[deckKey]];
        const count = Math.min(currentDeck.length, event.cardIds.length);
        const reorderedTop = event.cardIds.slice(0, count);
        const nextDeck = [...reorderedTop, ...currentDeck.slice(count)];
        const topDeckView = getTopDeckView(newState);
        const nextTopDeckView = {
          ...topDeckView,
          [event.seat]: {
            cardIds: reorderedTop,
            sourceCardId: event.sourceCardId,
            viewedAtTurn: newState.turnNumber,
          },
        };
        newState = {
          ...newState,
          [deckKey]: nextDeck,
          topDeckView: nextTopDeckView,
        };
        break;
      }

      case "COST_PAID":
        // Marker event — actual state changes are handled by the
        // follow-up events (CARD_DESTROYED, DAMAGE_DEALT, etc.)
        break;

      case "GAME_STARTED":
        newState.gameStarted = true;
        break;

      case "PONG_OPPORTUNITY": {
        newState = {
          ...newState,
          pendingPong: { seat: event.seat, destroyedCardId: event.destroyedCardId },
        };
        break;
      }

      case "PONG_ATTEMPTED": {
        newState = { ...newState, pendingPong: null };
        // CARD_BANISHED is handled separately if result is "sink"
        break;
      }

      case "PONG_DECLINED": {
        newState = { ...newState, pendingPong: null };
        break;
      }

      case "REDEMPTION_OPPORTUNITY": {
        newState = {
          ...newState,
          pendingRedemption: { seat: event.seat },
        };
        break;
      }

      case "REDEMPTION_ATTEMPTED": {
        newState = { ...newState, pendingRedemption: null };
        break;
      }

      case "REDEMPTION_GRANTED": {
        newState = {
          ...newState,
          hostLifePoints: event.newLP,
          awayLifePoints: event.newLP,
          pendingRedemption: null,
          gameOver: false,
          winner: null,
          winReason: null,
          redemptionUsed: {
            ...newState.redemptionUsed,
            [event.seat]: true,
          },
        };
        break;
      }

      case "EQUIP_DESTROYED": {
        const { cardId } = event;

        // Find and remove the equip from spell/trap zone, send to graveyard
        // Also remove from the monster's equippedCards and reverse stat modifiers
        for (const boardSide of ["host", "away"] as const) {
          const spellTrapKey = boardSide === "host" ? "hostSpellTrapZone" : "awaySpellTrapZone";
          const graveyardKey = boardSide === "host" ? "hostGraveyard" : "awayGraveyard";
          const boardKey = boardSide === "host" ? "hostBoard" : "awayBoard";

          const spellTrapZone = [...newState[spellTrapKey]];
          const stIdx = spellTrapZone.findIndex((c) => c.cardId === cardId);
          if (stIdx < 0) continue;

          // Remove from spell/trap zone
          spellTrapZone.splice(stIdx, 1);
          newState = {
            ...newState,
            [spellTrapKey]: spellTrapZone,
            [graveyardKey]: [...newState[graveyardKey], cardId],
          };

          // Reverse stat modifiers from the equip and remove from equippedCards
          const equipDef = getCardDefinition(newState, cardId);
          const board = [...newState[boardKey]];
          for (let i = 0; i < board.length; i++) {
            const monster = board[i];
            if (!monster || !monster.equippedCards.includes(cardId)) continue;

            let updatedMonster: BoardCard = {
              ...monster,
              equippedCards: monster.equippedCards.filter((id) => id !== cardId),
            };

            // Reverse stat boosts
            if (equipDef?.effects) {
              for (const eff of equipDef.effects) {
                for (const action of eff.actions) {
                  if (action.type === "boost_attack") {
                    updatedMonster = {
                      ...updatedMonster,
                      temporaryBoosts: {
                        ...updatedMonster.temporaryBoosts,
                        attack: updatedMonster.temporaryBoosts.attack - action.amount,
                      },
                    };
                  } else if (action.type === "boost_defense") {
                    updatedMonster = {
                      ...updatedMonster,
                      temporaryBoosts: {
                        ...updatedMonster.temporaryBoosts,
                        defense: updatedMonster.temporaryBoosts.defense - action.amount,
                      },
                    };
                  }
                }
              }
            }

            board[i] = updatedMonster;
          }
          newState = { ...newState, [boardKey]: board };
          break; // Found and handled
        }
        break;
      }

      case "CONTINUOUS_EFFECT_APPLIED": {
        const { sourceCardId, sourceSeat, targetCardId, effectType, amount } = event;
        const field = effectType === "boost_attack" ? "attack" : "defense";

        // Apply the stat boost to the target monster
        newState = applyTemporaryBoost(newState, targetCardId, field, amount);

        // Track the lingering effect
        const newLingering: LingeringEffect = {
          sourceCardId,
          effectType,
          amount,
          targetCardId,
          sourceSeat,
        };
        newState = {
          ...newState,
          lingeringEffects: [...newState.lingeringEffects, newLingering],
        };
        break;
      }

      case "CONTINUOUS_EFFECT_REMOVED": {
        const { sourceCardId, targetCardId, effectType, amount } = event;
        const field = effectType === "boost_attack" ? "attack" : "defense";

        // Reverse the stat boost
        newState = applyTemporaryBoost(newState, targetCardId, field, -amount);

        // Remove the lingering effect entry
        newState = {
          ...newState,
          lingeringEffects: newState.lingeringEffects.filter(
            (le) =>
              !(le.sourceCardId === sourceCardId &&
                le.targetCardId === targetCardId &&
                le.effectType === effectType)
          ),
        };
        break;
      }

      case "RITUAL_SUMMONED": {
        const { seat, cardId } = event;
        const isHost = seat === "host";
        const definitionId = resolveDefinitionId(newState, cardId);

        // Remove ritual monster from hand
        const handKey = isHost ? "hostHand" : "awayHand";
        const hand = [...newState[handKey]];
        const handIdx = hand.indexOf(cardId);
        if (handIdx > -1) {
          hand.splice(handIdx, 1);
          newState = { ...newState, [handKey]: hand };
        }

        // Add to board as face-up attack position BoardCard
        const newCard: BoardCard = {
          cardId,
          definitionId,
          position: "attack",
          faceDown: false,
          canAttack: false,
          hasAttackedThisTurn: false,
          changedPositionThisTurn: false,
          viceCounters: 0,
          temporaryBoosts: { attack: 0, defense: 0 },
          equippedCards: [],
          turnSummoned: newState.turnNumber,
        };

        const boardKey = isHost ? "hostBoard" : "awayBoard";
        newState = {
          ...newState,
          [boardKey]: [...newState[boardKey], newCard],
        };
        break;
      }

      default:
        assertNever(event);
    }
  }

  if (skipDerivedChecks) {
    return newState;
  }

  // Check for equip destruction when monsters leave the board
  const equipDestroyEvents: EngineEvent[] = [];
  for (const event of events) {
    if (event.type === "CARD_DESTROYED") {
      // Find if this card had equipped cards (check in the ORIGINAL state before evolve)
      // We need to check both sides
      for (const boardSide of ["host", "away"] as const) {
        const origBoard = boardSide === "host" ? state.hostBoard : state.awayBoard;
        const monster = origBoard.find((c) => c.cardId === event.cardId);
        if (monster && monster.equippedCards.length > 0) {
          for (const equipId of monster.equippedCards) {
            equipDestroyEvents.push({
              type: "EQUIP_DESTROYED",
              cardId: equipId,
              reason: "target_left",
            });
          }
        }
      }
    }
  }
  if (equipDestroyEvents.length > 0) {
    newState = evolve(newState, equipDestroyEvents);
  }

  // Check for continuous/field effect removal when source cards leave the field
  const continuousRemovalEvents: EngineEvent[] = [];
  for (const event of events) {
    // Cards sent to graveyard from spell/trap zone or field
    if (event.type === "CARD_SENT_TO_GRAVEYARD") {
      const { cardId, from } = event;
      if (from === "spell_trap_zone" || from === "spellTrapZone" || from === "field") {
        continuousRemovalEvents.push(
          ...removeContinuousEffectsForSource(state, cardId)
        );
      }
    }
    // Cards banished from spell/trap zone or field
    if (event.type === "CARD_BANISHED") {
      const { cardId, from } = event;
      if (from === "spell_trap_zone" || from === "spellTrapZone" || from === "field") {
        continuousRemovalEvents.push(
          ...removeContinuousEffectsForSource(state, cardId)
        );
      }
    }
    // Cards returned to hand from spell/trap zone or field
    if (event.type === "CARD_RETURNED_TO_HAND") {
      const { cardId, from } = event;
      if (from === "spell_trap_zone" || from === "spellTrapZone" || from === "field") {
        continuousRemovalEvents.push(
          ...removeContinuousEffectsForSource(state, cardId)
        );
      }
    }
  }
  if (continuousRemovalEvents.length > 0) {
    newState = evolve(newState, continuousRemovalEvents);
  }

  // After card removal or summoning, re-check continuous effects to apply to new monsters
  // or clean up effects for removed monsters. Only do this if we had events that could
  // affect the board (summons, destructions, etc.) and there are active lingering sources.
  const boardChangingTypes = new Set([
    "MONSTER_SUMMONED", "SPECIAL_SUMMONED", "FLIP_SUMMONED",
    "CARD_DESTROYED", "CARD_SENT_TO_GRAVEYARD", "CARD_BANISHED",
    "CARD_RETURNED_TO_HAND",
    "SPELL_ACTIVATED", "TRAP_ACTIVATED",
  ]);
  const hadBoardChange = events.some((e) => boardChangingTypes.has(e.type));
  if (hadBoardChange) {
    const continuousRefreshEvents = applyContinuousEffects(newState);
    if (continuousRefreshEvents.length > 0) {
      newState = evolve(newState, continuousRefreshEvents);
    }
  }

  // Process trigger effects (on_summon, etc.)
  const triggerEvents = detectTriggerEffects(newState, events);
  if (triggerEvents.length > 0) {
    newState = evolve(newState, triggerEvents);
  }

  // State-based checks (LP zero, deck-out, breakdown win conditions)
  if (!newState.gameOver && !newState.pendingPong && !newState.pendingRedemption) {
    const stateBasedEvents = checkStateBasedActions(newState);

    // Check if we should intercept GAME_ENDED for redemption
    if (newState.config.redemptionEnabled && stateBasedEvents.length > 0) {
      const gameEndEvent = stateBasedEvents.find(
        (e): e is Extract<EngineEvent, { type: "GAME_ENDED" }> =>
          e.type === "GAME_ENDED" && e.reason === "lp_zero"
      );
      if (gameEndEvent) {
        const loserSeat = opponentSeat(gameEndEvent.winner);
        const alreadyUsed = newState.redemptionUsed[loserSeat];
        if (!alreadyUsed) {
          // Replace GAME_ENDED with REDEMPTION_OPPORTUNITY
          const filteredEvents = stateBasedEvents.filter(e => e !== gameEndEvent);
          const redemptionEvents: EngineEvent[] = [
            ...filteredEvents,
            { type: "REDEMPTION_OPPORTUNITY", seat: loserSeat },
          ];
          newState = evolve(newState, redemptionEvents);
          return newState;
        }
      }
    }

    if (stateBasedEvents.length > 0) {
      newState = evolve(newState, stateBasedEvents);
    }
  }

  return newState;
}
