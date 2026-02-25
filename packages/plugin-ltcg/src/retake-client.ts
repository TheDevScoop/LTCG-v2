/**
 * retake.tv HTTP client for ElizaOS plugin.
 *
 * Server-side counterpart of apps/web-tanstack/src/app/lib/retake.ts.
 * Uses getEnvValue() for config instead of Vite import.meta.env.
 *
 * Singleton pattern matching LTCGClient (initRetakeClient / getRetakeClient).
 */

// ── Types ────────────────────────────────────────────────────────

export type RetakeAgent = {
  access_token: string;
  agent_id: string;
  userDbId: string;
  agent_name?: string;
  wallet_address: string;
  token_address: string | null;
  token_ticker: string;
};

export type StreamStartResult = {
  success: boolean;
  token: {
    name: string;
    ticker: string;
    imageUrl: string;
    tokenAddress: string;
    poolAddress: string;
    tokenType: string;
  };
};

export type StreamStopResult = {
  status: string;
  duration_seconds: number;
  viewers: number;
};

export type StreamStatus = {
  is_live: boolean;
  viewers: number;
  token_address: string | null;
  uptime_seconds: number;
  userDbId: string;
};

export type RtmpCredentials = {
  url: string;
  key: string;
};

export type ChatMessage = {
  message_id: string;
  sent_at: string;
};

export type ChatComment = {
  chat_event_id: string;
  sender_user_id: string;
  sender_username: string;
  sender_display_name: string;
  sender_pfp: string;
  sender_wallet_address: string;
  sender_streamercoin_holdings: number;
  session_id: string;
  streamer_id: string;
  text: string;
  timestamp: string;
  type: string;
};

// ── Client class ─────────────────────────────────────────────────

export class RetakeClient {
  private readonly apiUrl: string;
  private token: string;

  /** Default timeout for HTTP requests (ms). */
  static readonly REQUEST_TIMEOUT_MS = 30_000;

  /** Maximum number of retry attempts for transient failures. */
  static readonly MAX_RETRIES = 2;

  constructor(apiUrl: string, token = "") {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.token = token;
  }

  get hasToken(): boolean {
    return this.token.length > 0;
  }

  get baseUrl(): string {
    return this.apiUrl;
  }

  setToken(token: string): void {
    this.token = token;
  }

  // ── API methods ──────────────────────────────────────────────

  /** Register a new agent on retake.tv. Stores the returned token. */
  async register(opts: {
    agent_name: string;
    agent_description: string;
    image_url: string;
    wallet_address: string;
    ticker: string;
  }): Promise<RetakeAgent> {
    const data = await this.request<RetakeAgent>("POST", "/agent/register", opts);
    if (data.access_token) {
      this.token = data.access_token;
    }
    return data;
  }

  /** Get RTMP credentials for OBS/ffmpeg push. */
  async getRtmpCredentials(): Promise<RtmpCredentials> {
    return this.request<RtmpCredentials>("POST", "/agent/rtmp");
  }

  /** Start a stream session. Creates a token on first call. */
  async startStream(): Promise<StreamStartResult> {
    return this.request<StreamStartResult>("POST", "/agent/stream/start");
  }

  /** Stop a stream session. */
  async stopStream(): Promise<StreamStopResult> {
    return this.request<StreamStopResult>("POST", "/agent/stream/stop");
  }

  /** Get current stream status (is_live, viewers, uptime). */
  async getStreamStatus(): Promise<StreamStatus> {
    return this.request<StreamStatus>("GET", "/agent/stream/status");
  }

  /** Send a chat message to a streamer's room. */
  async sendChat(message: string, destinationUserId: string): Promise<ChatMessage> {
    return this.request<ChatMessage>("POST", "/agent/stream/chat/send", {
      message,
      destination_user_id: destinationUserId,
      access_token: this.token,
    });
  }

  /** Get chat comments for a stream. */
  async getComments(
    userDbId: string,
    limit = 50,
    beforeId?: string,
  ): Promise<{ comments: ChatComment[] }> {
    const params = new URLSearchParams({
      userDbId,
      limit: String(limit),
    });
    if (beforeId) params.set("beforeId", beforeId);
    return this.request<{ comments: ChatComment[] }>(
      "GET",
      `/agent/stream/comments?${params}`,
    );
  }

  // ── HTTP helpers ─────────────────────────────────────────────

  private authHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
    };
  }

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
      RetakeClient.REQUEST_TIMEOUT_MS,
    );

    const headers = this.token
      ? this.authHeaders()
      : { "Content-Type": "application/json" };

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (attempt < RetakeClient.MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RetakeClient.backoffDelay(attempt)));
        return this.request<T>(method, path, body, attempt + 1);
      }
      const msg =
        err instanceof Error && err.name === "AbortError"
          ? "Request timed out"
          : err instanceof Error
            ? err.message
            : "Network error";
      throw new Error(`[retake] ${msg} — ${method} ${path}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 503 && attempt < RetakeClient.MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RetakeClient.backoffDelay(attempt)));
      return this.request<T>(method, path, body, attempt + 1);
    }

    const contentType = res.headers.get("content-type") ?? "";
    let data: unknown;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new Error(
        `[retake] Expected JSON, got ${contentType || "no content-type"} — ${method} ${path}: ${text.slice(0, 200)}`,
      );
    }

    if (!res.ok) {
      const errMsg =
        data !== null &&
        typeof data === "object" &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : `HTTP ${res.status}`;
      throw new Error(`[retake] ${errMsg} — ${method} ${path}`);
    }

    return data as T;
  }
}

// ── Module-level singleton ───────────────────────────────────────

let _client: RetakeClient | null = null;

/** Initialize the retake client. Call during plugin init if RETAKE_API_URL is set. */
export function initRetakeClient(apiUrl: string, token = ""): RetakeClient {
  _client = new RetakeClient(apiUrl, token);
  return _client;
}

/** Get the initialized retake client, or null if not configured. */
export function getRetakeClient(): RetakeClient | null {
  return _client;
}
