import type { CardDefinition } from "./cards.js";
import type { EngineConfig } from "./config.js";

export type Seat = "host" | "away";
export type Phase = "draw" | "standby" | "main" | "combat" | "main2" | "breakdown_check" | "end";
export type Position = "attack" | "defense";
export type WinReason = "lp_zero" | "deck_out" | "breakdown" | "surrender";

export interface BoardCard {
  cardId: string;
  definitionId: string;
  position: Position;
  faceDown: boolean;
  canAttack: boolean;
  hasAttackedThisTurn: boolean;
  changedPositionThisTurn: boolean;
  viceCounters: number;
  temporaryBoosts: { attack: number; defense: number };
  equippedCards: string[];
  turnSummoned: number;
}

export interface SpellTrapCard {
  cardId: string;
  definitionId: string;
  faceDown: boolean;
  activated: boolean;
  isFieldSpell?: boolean;
}

export interface ChainLink {
  cardId: string;
  effectIndex: number;
  activatingPlayer: Seat;
  targets: string[];
}

export interface PendingAction {
  type: string;
  playerId: string;
  data: Record<string, unknown>;
}

export interface TemporaryModifier {
  cardId: string;
  field: "attack" | "defense";
  amount: number;
  expiresAt: "end_of_turn" | "end_of_next_turn" | "permanent";
  source: string;
  expiresOnTurn?: number;
}

export interface LingeringEffect {
  sourceCardId: string;
  effectType: string;
  affectedZone: string;
  expiresAt?: number;
}

export interface GameState {
  config: EngineConfig;
  cardLookup: Record<string, CardDefinition>;
  hostId: string;
  awayId: string;
  hostHand: string[];
  hostBoard: BoardCard[];
  hostSpellTrapZone: SpellTrapCard[];
  hostFieldSpell: SpellTrapCard | null;
  hostDeck: string[];
  hostGraveyard: string[];
  hostBanished: string[];
  awayHand: string[];
  awayBoard: BoardCard[];
  awaySpellTrapZone: SpellTrapCard[];
  awayFieldSpell: SpellTrapCard | null;
  awayDeck: string[];
  awayGraveyard: string[];
  awayBanished: string[];
  hostLifePoints: number;
  awayLifePoints: number;
  hostBreakdownsCaused: number;
  awayBreakdownsCaused: number;
  currentTurnPlayer: Seat;
  turnNumber: number;
  currentPhase: Phase;
  hostNormalSummonedThisTurn: boolean;
  awayNormalSummonedThisTurn: boolean;
  currentChain: ChainLink[];
  currentPriorityPlayer: Seat | null;
  currentChainPasser: Seat | null;
  pendingAction: PendingAction | null;
  temporaryModifiers: TemporaryModifier[];
  lingeringEffects: LingeringEffect[];
  optUsedThisTurn: string[];
  hoptUsedEffects: string[];
  winner: Seat | null;
  winReason: WinReason | null;
  gameOver: boolean;
  gameStarted: boolean;
  pendingPong: { seat: Seat; destroyedCardId: string } | null;
  pendingRedemption: { seat: Seat } | null;
  redemptionUsed: { host: boolean; away: boolean };
}

export interface PlayerView {
  hand: string[];
  board: BoardCard[];
  spellTrapZone: SpellTrapCard[];
  fieldSpell: SpellTrapCard | null;
  graveyard: string[];
  banished: string[];
  lifePoints: number;
  deckCount: number;
  breakdownsCaused: number;
  opponentHandCount: number;
  opponentBoard: BoardCard[];
  opponentSpellTrapZone: SpellTrapCard[];
  opponentFieldSpell: SpellTrapCard | null;
  opponentGraveyard: string[];
  opponentBanished: string[];
  opponentLifePoints: number;
  opponentDeckCount: number;
  opponentBreakdownsCaused: number;
  currentTurnPlayer: Seat;
  currentPriorityPlayer: Seat | null;
  turnNumber: number;
  currentPhase: Phase;
  currentChain: ChainLink[];
  normalSummonedThisTurn: boolean;
  maxBoardSlots: number;
  maxSpellTrapSlots: number;
  mySeat: Seat;
  gameOver: boolean;
  winner: Seat | null;
  winReason: WinReason | null;
  pendingPong: { seat: Seat; destroyedCardId: string } | null;
  pendingRedemption: { seat: Seat } | null;
}
