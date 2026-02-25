/**
 * Type definitions for @lunchtable/plugin-ltcg
 *
 * Includes:
 * - ElizaOS plugin interface types (structurally compatible — no @elizaos/core needed)
 * - LTCG game API response types (matching convex/http.ts endpoints)
 */

// ── ElizaOS Plugin Interface ─────────────────────────────────────
// Structural types matching @elizaos/core v2 (1.7.x).
// At runtime, ElizaOS provides the real implementations.

export interface Memory {
  content: {
    text?: string;
    action?: string;
    source?: string;
    [key: string]: unknown;
  };
  entityId?: string;
  roomId?: string;
  [key: string]: unknown;
}

export type State = Record<string, unknown>;

export type Content = {
  text?: string;
  action?: string;
  [key: string]: unknown;
};

/** Callback for action handlers to send messages to the user */
export type HandlerCallback = (response: Content) => Promise<Memory[]>;

/** Return type for action handlers */
export interface ActionResult {
  success: boolean;
  text?: string;
  data?: unknown;
  error?: string;
}

export interface IAgentRuntime {
  agentId: string;
  getSetting(key: string): string | undefined;
  getService<T>(type: string): T | null;
  registerEvent(event: string, handler: EventHandler): void;
  emitEvent(event: string, payload: unknown): Promise<void>;
  [key: string]: unknown;
}

export interface Action {
  name: string;
  description: string;
  similes?: string[];
  examples?: Array<Array<{ name: string; content: Content }>>;
  validate(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
  ): Promise<boolean>;
  handler(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
    responses?: Memory[],
  ): Promise<ActionResult | void | undefined>;
}

export interface Provider {
  name?: string;
  description?: string;
  get(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
  ): Promise<Content>;
}

// ── Route types ──────────────────────────────────────────────────

export interface RouteRequest {
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  path?: string;
  url?: string;
}

export interface RouteResponse {
  status(code: number): RouteResponse;
  json(data: unknown): RouteResponse;
  send(data: unknown): RouteResponse;
  end(): RouteResponse;
  setHeader?(name: string, value: string | string[]): RouteResponse;
  headersSent?: boolean;
}

export interface Route {
  type: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "STATIC";
  path: string;
  public?: boolean;
  name?: string;
  handler?: (
    req: RouteRequest,
    res: RouteResponse,
    runtime: IAgentRuntime,
  ) => Promise<void>;
}

// ── Event types ──────────────────────────────────────────────────

export type EventHandler<_K = unknown> = (
  payload: Record<string, unknown>,
  runtime: IAgentRuntime,
) => Promise<void>;

export type PluginEvents = {
  [event: string]: EventHandler[];
};

// ── Plugin interface ─────────────────────────────────────────────

export interface Plugin {
  name: string;
  description: string;
  config?: Record<string, string | number | boolean | null | undefined>;
  init?(
    config: Record<string, string>,
    runtime: IAgentRuntime,
  ): Promise<void>;
  actions?: Action[];
  providers?: Provider[];
  evaluators?: unknown[];
  services?: unknown[];
  routes?: Route[];
  events?: PluginEvents;
  priority?: number;
  dependencies?: string[];
}

// ── LTCG Agent API Types ─────────────────────────────────────────
// Match the response shapes from convex/http.ts endpoints.

/** GET /api/agent/me */
export interface AgentInfo {
  id: string;
  name: string;
  userId: string;
  apiKeyPrefix: string;
  isActive: boolean;
  createdAt: number;
}

/** GET /api/agent/game/chapters (array) */
export interface Chapter {
  _id: string;
  title?: string;
  name?: string;
  description?: string;
}

/** GET /api/agent/game/starter-decks (array) */
export interface StarterDeck {
  deckCode: string;
  name: string;
  archetype?: string;
  description?: string;
}

export interface DialogueLine {
  speaker: string;
  text: string;
  avatar?: string;
}

/** Card identifier in the player's hand (from PlayerView.hand). */
export type CardInHand = string;

/** Card on the game field */
export interface BoardCard {
  cardId: string;
  definitionId?: string;
  position?: "attack" | "defense";
  faceDown?: boolean;
  canAttack?: boolean;
  hasAttackedThisTurn?: boolean;
  changedPositionThisTurn?: boolean;
  viceCounters?: number;
  temporaryBoosts?: { attack: number; defense: number };
  equippedCards?: string[];
  turnSummoned?: number;

  // Legacy compatibility when logs or older callers pass instance-based objects.
  instanceId?: string;
  name?: string;
  attack?: number;
  defense?: number;
  level?: number;
}

/** GET /api/agent/game/view */
export interface PlayerView {
  /**
   * Visible instance ID -> definition ID mapping from engine mask.
   * Hand IDs are always instance IDs in modern snapshots.
   */
  instanceDefinitions?: Record<string, string>;
  gameOver: boolean;
  phase:
    | "draw"
    | "standby"
    | "main"
    | "combat"
    | "main2"
    | "breakdown_check"
    | "end";
  currentTurnPlayer: "host" | "away";
  players?: {
    host: { lifePoints: number };
    away: { lifePoints: number };
  };
  hand: CardInHand[];
  board: BoardCard[];
  spellTrapZone?: BoardCard[];
  fieldSpell?: BoardCard | null;
  graveyard?: string[];
  banished?: string[];
  lifePoints?: number;
  deckCount?: number;
  breakdownsCaused?: number;
  opponentLifePoints?: number;
  opponentDeckCount?: number;
  opponentBreakdownsCaused?: number;
  currentChain?: unknown[];
  currentPriorityPlayer?: "host" | "away" | null;
  currentChainPasser?: "host" | "away" | null;
  mySeat?: "host" | "away";
  opponentHandCount?: number;
  opponentBoard: BoardCard[];
  opponentSpellTrapZone?: BoardCard[];
  opponentFieldSpell?: BoardCard | null;
  opponentGraveyard?: string[];
  opponentBanished?: string[];

  // Legacy compatibility for old masking shape consumers.
  playerField?: {
    monsters: (BoardCard | null)[];
    spellTraps?: (unknown | null)[];
  };
  opponentField?: {
    monsters: (BoardCard | null)[];
    spellTraps?: (unknown | null)[];
  };
}

/** GET /api/agent/game/match-status */
export interface MatchStatus {
  matchId: string;
  status: string;
  mode: string;
  winner: string | null;
  endReason: string | null;
  isGameOver: boolean;
  chapterId: string | null;
  stageNumber: number | null;
  outcome: string | null;
  starsEarned: number | null;
  hostId?: string | null;
  awayId?: string | null;
  seat?: "host" | "away";
  latestSnapshotVersion: number;
}

export interface SubmitActionResult {
  events: string;
  version: number;
}

export interface MatchActive {
  matchId: string | null;
  status: string | null;
  mode?: string;
  createdAt?: number;
  hostId?: string | null;
  awayId?: string | null;
  seat?: "host" | "away";
}

export interface MatchJoinResult {
  matchId: string;
  hostId: string;
  mode: "pvp" | "story";
  seat: "away";
}

// ── Story Mode Types ─────────────────────────────────────────────

/** Stage progress for a single stage */
export interface StageProgress {
  stageId: string;
  chapterId: string;
  stageNumber: number;
  status: "completed" | "starred" | "locked";
  starsEarned: number;
  timesCompleted: number;
}

/** GET /api/agent/story/progress */
export interface StoryProgress {
  chapters: Chapter[];
  chapterProgress: Array<{
    chapterId: string;
    status: string;
  }>;
  stageProgress: StageProgress[];
  totalStars: number;
}

/** GET /api/agent/story/next-stage */
export interface StoryNextStageResponse {
  done: boolean;
  chapterId?: string;
  stageNumber?: number;
  chapterTitle?: string;
  opponentName?: string;
}

/** GET /api/agent/story/stage */
export interface StageData {
  _id: string;
  chapterId: string;
  stageNumber: number;
  opponentName: string;
  rewardGold?: number;
  rewardXp?: number;
  firstClearBonus?: number;
  narrative: {
    preMatchDialogue: DialogueLine[];
    postMatchWinDialogue: DialogueLine[];
    postMatchLoseDialogue: DialogueLine[];
  };
}

/** POST /api/agent/story/complete-stage */
export interface StageCompletionResult {
  outcome: "won" | "lost";
  starsEarned: number;
  rewards: {
    gold: number;
    xp: number;
    firstClearBonus: number;
  };
}

/** Commands sent via POST /api/agent/game/action */
export type GameCommand =
  | { type: "SUMMON"; cardId: string; position: "attack" | "defense"; tributeCardIds?: string[] }
  | { type: "SET_MONSTER"; cardId: string }
  | { type: "ACTIVATE_SPELL"; cardId: string }
  | { type: "SET_SPELL_TRAP"; cardId: string }
  | { type: "ACTIVATE_TRAP"; cardId: string }
  | {
      type: "DECLARE_ATTACK";
      attackerId: string;
      targetId?: string;
    }
  | { type: "ADVANCE_PHASE" }
  | { type: "END_TURN" }
  | {
      type: "CHANGE_POSITION";
      cardId: string;
      newPosition: string;
    }
  | { type: "FLIP_SUMMON"; cardId: string }
  | {
      type: "CHAIN_RESPONSE";
      pass: boolean;
      cardId?: string;
      sourceCardId?: string;
      effectIndex?: number;
      chainLink?: number;
      targets?: string[];
    }
  | { type: "SURRENDER" };
