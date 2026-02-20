/**
 * HTTP client for the LTCG Agent API.
 *
 * Encapsulates all communication with the Convex HTTP endpoints at /api/agent/*.
 * Initialized during plugin init, accessed via getClient().
 */

import type {
  AgentInfo,
  Chapter,
  GameCommand,
  MatchActive,
  MatchStatus,
  MatchJoinResult,
  PlayerView,
  StageCompletionResult,
  StageData,
  StarterDeck,
  StoryNextStageResponse,
  StoryProgress,
} from "./types.js";

// ── Error class ──────────────────────────────────────────────────

export class LTCGApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = "LTCGApiError";
  }
}

// ── Client class ─────────────────────────────────────────────────

export class LTCGClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private matchId: string | null = null;
  private seat: MatchActive["seat"] | null = null;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  // ── Match state ──────────────────────────────────────────────

  get currentMatchId(): string | null {
    return this.matchId;
  }

  get hasActiveMatch(): boolean {
    return this.matchId !== null;
  }

  get currentSeat(): MatchActive["seat"] | null {
    return this.seat;
  }

  setSeat(seat: MatchActive["seat"] | null): void {
    this.seat = seat;
  }

  setMatch(id: string | null): void {
    this.matchId = id;
    if (!id) this.seat = null;
  }

  async setMatchWithSeat(id: string | null): Promise<void> {
    this.setMatch(id);
    if (!id) return;
    try {
      await this.syncSeatFromMatch(id);
    } catch {
      // Seat sync is best-effort; gameplay can continue with host fallback.
    }
  }

  async syncSeatFromMatch(matchId: string): Promise<MatchActive["seat"] | null> {
    const status = await this.getMatchStatus(matchId);
    const seat = status.seat;

    if (seat === "host" || seat === "away") {
      this.seat = seat;
      return seat;
    }

    return null;
  }

  // ── Agent endpoints ──────────────────────────────────────────

  /** GET /api/agent/me — verify credentials, get agent info */
  async getMe(): Promise<AgentInfo> {
    return this.get("/api/agent/me");
  }

  /** GET /api/agent/game/chapters — list story chapters */
  async getChapters(): Promise<Chapter[]> {
    return this.get("/api/agent/game/chapters");
  }

  /** GET /api/agent/game/starter-decks — list available decks */
  async getStarterDecks(): Promise<StarterDeck[]> {
    return this.get("/api/agent/game/starter-decks");
  }

  /** POST /api/agent/game/select-deck — choose a starter deck */
  async selectDeck(deckCode: string): Promise<unknown> {
    return this.post("/api/agent/game/select-deck", { deckCode });
  }

  /** POST /api/agent/game/start — start a story battle */
  async startBattle(
    chapterId: string,
    stageNumber?: number,
  ): Promise<{ matchId: string }> {
    return this.post("/api/agent/game/start", { chapterId, stageNumber });
  }

  /** POST /api/agent/game/start-duel — start a quick AI-vs-human duel */
  async startDuel(): Promise<{ matchId: string }> {
    return this.post("/api/agent/game/start-duel", {});
  }

  /** POST /api/agent/game/join — join a waiting match as away player */
  async joinMatch(
    matchId: string,
  ): Promise<{ matchId: string; hostId: string; mode: "pvp" | "story"; seat: "away" }> {
    return this.post("/api/agent/game/join", { matchId });
  }

  /** POST /api/agent/game/action — submit a game command */
  async submitAction(
    matchId: string,
    command: GameCommand,
    seat?: MatchActive["seat"],
    expectedVersion?: number,
  ): Promise<unknown> {
    const resolvedSeat = seat ?? this.seat;
    const payload: {
      matchId: string;
      command: GameCommand;
      seat?: MatchActive["seat"];
      expectedVersion?: number;
    } = { matchId, command };

    if (resolvedSeat) {
      payload.seat = resolvedSeat;
    }
    if (typeof expectedVersion === "number") {
      payload.expectedVersion = expectedVersion;
    }

    return this.post("/api/agent/game/action", payload);
  }

  /** GET /api/agent/game/view — get player's view of game state */
  async getView(
    matchId: string,
    seat?: MatchActive["seat"],
  ): Promise<PlayerView> {
    const resolvedSeat = seat ?? this.seat;
    const query = [`matchId=${encodeURIComponent(matchId)}`];

    if (resolvedSeat) {
      query.push(`seat=${encodeURIComponent(resolvedSeat)}`);
    }

    const qs = query.join("&");
    return this.get(`/api/agent/game/view?${qs}`);
  }

  /** GET /api/agent/game/match-status — get match metadata */
  async getMatchStatus(matchId: string): Promise<MatchStatus> {
    const qs = `matchId=${encodeURIComponent(matchId)}`;
    return this.get(`/api/agent/game/match-status?${qs}`);
  }

  /** GET /api/agent/active-match — active match for this agent */
  async getActiveMatch(): Promise<MatchActive> {
    return this.get("/api/agent/active-match");
  }

  // ── Story endpoints ────────────────────────────────────────────

  /** GET /api/agent/story/progress — get full story progress */
  async getStoryProgress(): Promise<StoryProgress> {
    return this.get("/api/agent/story/progress");
  }

  /** GET /api/agent/story/next-stage — get next playable story stage */
  async getNextStoryStage(): Promise<StoryNextStageResponse> {
    return this.get("/api/agent/story/next-stage");
  }

  /** GET /api/agent/story/stage — get stage data with narrative */
  async getStage(chapterId: string, stageNumber: number): Promise<StageData> {
    const qs = `chapterId=${encodeURIComponent(chapterId)}&stageNumber=${stageNumber}`;
    return this.get(`/api/agent/story/stage?${qs}`);
  }

  /** POST /api/agent/story/complete-stage — finalize a completed stage */
  async completeStage(matchId: string): Promise<StageCompletionResult> {
    return this.post("/api/agent/story/complete-stage", { matchId });
  }

  // ── HTTP helpers ─────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    return this.request("GET", path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  /** Default timeout for HTTP requests (ms). */
  static readonly REQUEST_TIMEOUT_MS = 30_000;

  /** Maximum number of retry attempts for transient failures. */
  static readonly MAX_RETRIES = 2;

  /** Exponential backoff delay: 1s, 2s, 4s, capped at 8s. */
  private static backoffDelay(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 8000);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    attempt = 0,
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      LTCGClient.REQUEST_TIMEOUT_MS,
    );

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      // Retry on network errors / timeouts with exponential backoff
      if (attempt < LTCGClient.MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, LTCGClient.backoffDelay(attempt)));
        return this.request<T>(method, path, body, attempt + 1);
      }
      const errorMessage =
        err instanceof Error && err.name === "AbortError"
          ? "Request timed out"
          : err instanceof Error
            ? err.message
            : "Network error";
      throw new LTCGApiError(
        errorMessage,
        0,
        `${method} ${path.split("?")[0]}`,
      );
    } finally {
      clearTimeout(timer);
    }

    // Retry on 503 (service unavailable) with exponential backoff
    if (res.status === 503 && attempt < LTCGClient.MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, LTCGClient.backoffDelay(attempt)));
      return this.request<T>(method, path, body, attempt + 1);
    }

    // Safe JSON parsing: check Content-Type before calling .json()
    const contentType = res.headers.get("content-type") ?? "";
    let data: unknown;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new LTCGApiError(
        `Expected JSON response, got ${contentType || "no content-type"}`,
        res.status,
        `${method} ${path.split("?")[0]}`,
      );
    }

    if (!res.ok) {
      const errData = data as Record<string, unknown>;
      throw new LTCGApiError(
        (typeof errData.error === "string" ? errData.error : null) ?? `HTTP ${res.status}`,
        res.status,
        `${method} ${path.split("?")[0]}`,
      );
    }

    return data as T;
  }
}

// ── Module-level singleton ───────────────────────────────────────

let _client: LTCGClient | null = null;

/** Initialize the client during plugin init. */
export function initClient(apiUrl: string, apiKey: string): LTCGClient {
  _client = new LTCGClient(apiUrl, apiKey);
  return _client;
}

/** Get the initialized client. Throws if init hasn't been called. */
export function getClient(): LTCGClient {
  if (!_client) {
    throw new Error(
      "LTCG client not initialized. Plugin init() must run first.",
    );
  }
  return _client;
}
