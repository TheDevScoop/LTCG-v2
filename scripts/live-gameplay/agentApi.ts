type HttpMethod = "GET" | "POST";

export class LtcgAgentApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(args: { status: number; path: string; message: string }) {
    super(args.message);
    this.name = "LtcgAgentApiError";
    this.status = args.status;
    this.path = args.path;
  }
}

function normalizeBaseUrl(url: string) {
  const trimmed = url.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

const DEFAULT_TIMEOUT_MS = 10000;

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  if (!text.trim()) return `HTTP ${res.status}`;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") {
      const message = (parsed as any).error ?? (parsed as any).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  } catch {
    // ignore
  }
  return text.slice(0, 500);
}

export type AgentRegisterResult = {
  agentId: string;
  userId: string;
  apiKey: string; // Do not persist this to artifacts/logs.
  apiKeyPrefix: string;
};

export type AgentMe = {
  id: string;
  name: string;
  userId: string;
  apiKeyPrefix: string;
};

export type MatchStatus = {
  matchId: string;
  status: string | null;
  mode: string | null;
  winner: string | null;
  endReason: string | null;
  isGameOver: boolean;
  hostId: string | null;
  awayId: string | null;
  seat: "host" | "away";
  chapterId: string | null;
  stageNumber: number | null;
  outcome: string | null;
  starsEarned: number | null;
  latestSnapshotVersion: number;
};

export type PvpLobbyCreateResult = {
  matchId: string;
  visibility: "public";
  joinCode: null;
  status: "waiting";
  createdAt: number;
};

export class LtcgAgentApiClient {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly timeoutMs: number;

  constructor(args: { baseUrl: string; apiKey?: string | null; timeoutMs?: number }) {
    this.baseUrl = normalizeBaseUrl(args.baseUrl);
    this.apiKey = args.apiKey?.trim() ? args.apiKey.trim() : null;
    this.timeoutMs =
      typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs)
        ? Math.max(1, args.timeoutMs)
        : DEFAULT_TIMEOUT_MS;
  }

  withApiKey(apiKey: string) {
    return new LtcgAgentApiClient({ baseUrl: this.baseUrl, apiKey, timeoutMs: this.timeoutMs });
  }

  private async requestJson<T>(
    method: HttpMethod,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err: any) {
      const message =
        err?.name === "AbortError"
          ? `Request timed out after ${this.timeoutMs}ms`
          : `Unable to connect. Is the computer able to access the url?`;
      throw new Error(`${message}\n  path: "${url}"`);
    } finally {
      clearTimeout(id);
    }

    if (!res.ok) {
      throw new LtcgAgentApiError({
        status: res.status,
        path,
        message: await readErrorMessage(res),
      });
    }

    const json = (await res.json()) as T;
    return json;
  }

  async registerAgent(name: string): Promise<AgentRegisterResult> {
    return await this.requestJson("POST", "/api/agent/register", { name });
  }

  async getMe(): Promise<AgentMe> {
    return await this.requestJson("GET", "/api/agent/me");
  }

  async getChapters(): Promise<any[]> {
    return await this.requestJson("GET", "/api/agent/game/chapters");
  }

  async getStarterDecks(): Promise<any[]> {
    return await this.requestJson("GET", "/api/agent/game/starter-decks");
  }

  async selectDeck(deckCode: string): Promise<any> {
    return await this.requestJson("POST", "/api/agent/game/select-deck", { deckCode });
  }

  async startStory(args: { chapterId: string; stageNumber?: number }): Promise<{ matchId: string }> {
    return await this.requestJson("POST", "/api/agent/game/start", {
      chapterId: args.chapterId,
      stageNumber: args.stageNumber,
    });
  }

  async startDuel(): Promise<{ matchId: string }> {
    return await this.requestJson("POST", "/api/agent/game/start-duel", {});
  }

  async createPvpLobby(): Promise<PvpLobbyCreateResult> {
    return await this.requestJson("POST", "/api/agent/game/pvp/create", {});
  }

  async joinMatch(matchId: string): Promise<any> {
    return await this.requestJson("POST", "/api/agent/game/join", { matchId });
  }

  async getView(args: { matchId: string; seat?: "host" | "away" }): Promise<any> {
    const qs = new URLSearchParams({ matchId: args.matchId });
    if (args.seat) qs.set("seat", args.seat);
    return await this.requestJson("GET", `/api/agent/game/view?${qs.toString()}`);
  }

  async getPublicView(args: { matchId: string; seat?: "host" | "away" }): Promise<any> {
    const qs = new URLSearchParams({ matchId: args.matchId });
    if (args.seat) qs.set("seat", args.seat);
    return await this.requestJson("GET", `/api/agent/game/public-view?${qs.toString()}`);
  }

  async getPublicEvents(args: {
    matchId: string;
    seat?: "host" | "away";
    sinceVersion?: number;
  }): Promise<any[]> {
    const qs = new URLSearchParams({ matchId: args.matchId });
    if (args.seat) qs.set("seat", args.seat);
    if (typeof args.sinceVersion === "number") {
      qs.set("sinceVersion", String(args.sinceVersion));
    }
    return await this.requestJson("GET", `/api/agent/game/public-events?${qs.toString()}`);
  }

  async submitAction(args: {
    matchId: string;
    command: Record<string, unknown>;
    seat?: "host" | "away";
    expectedVersion: number;
  }): Promise<{ events: string; version: number }> {
    return await this.requestJson("POST", "/api/agent/game/action", {
      matchId: args.matchId,
      command: args.command,
      seat: args.seat,
      expectedVersion: args.expectedVersion,
    });
  }

  async getMatchStatus(matchId: string): Promise<MatchStatus> {
    const qs = new URLSearchParams({ matchId });
    return await this.requestJson("GET", `/api/agent/game/match-status?${qs.toString()}`);
  }

  async completeStoryStage(matchId: string): Promise<any> {
    return await this.requestJson("POST", "/api/agent/story/complete-stage", { matchId });
  }

  async getNextStoryStage(): Promise<any> {
    return await this.requestJson("GET", "/api/agent/story/next-stage");
  }
}
