/**
 * milaidy iframe integration
 *
 * Handles postMessage communication between the LTCG game client
 * and the milaidy Electron host app.
 */

// Allowed origins for incoming messages from the host app
// Configure via environment variable: VITE_MILAIDY_ORIGIN
const ALLOWED_ORIGINS = [
  "http://localhost:2138", // milaidy UI local dev
  "http://localhost:3000", // milaidy alternative dev port
  "http://localhost:3334", // LTCG dev server (self-embed testing)
  "https://milaidy.app", // Production
  "https://app.milaidy.xyz", // Alternative domain
];

const OPAQUE_ORIGINS = new Set(["file://", "null"]);

function isTruthy(value: unknown) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function getRuntimeEnv() {
  return ((import.meta as any).env ?? {}) as Record<string, unknown>;
}

function getEnvString(name: string): string | undefined {
  const runtimeValue = getRuntimeEnv()[name];
  if (typeof runtimeValue === "string") return runtimeValue;
  const processValue =
    typeof process !== "undefined" && process?.env && typeof process.env[name] === "string"
      ? process.env[name]
      : undefined;
  const value = processValue;
  return typeof value === "string" ? value : undefined;
}

function allowOpaqueOrigins() {
  const env = getRuntimeEnv();
  const nodeEnv =
    typeof process !== "undefined" && process?.env ? process.env.NODE_ENV : undefined;
  const mode = String(getEnvString("MODE") ?? nodeEnv ?? "").toLowerCase();
  const isLocalRuntime = Boolean(env.DEV) || mode === "test" || mode === "development";
  return isLocalRuntime && isTruthy(getEnvString("VITE_MILAIDY_ALLOW_OPAQUE_ORIGINS"));
}

export type IframeChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  createdAt?: number;
};

export type StartMatchPayload = {
  mode: "story" | "pvp";
  matchId?: string;
  chapterId?: string;
  stageNumber?: number;
};

// Messages sent from game -> milaidy
export type GameToHost =
  | { type: "LTCG_READY" }
  | { type: "MATCH_STARTED"; matchId: string }
  | { type: "MATCH_ENDED"; matchId?: string; result: "win" | "loss" | "draw" }
  | { type: "LTCG_CHAT_SEND"; text: string; matchId?: string; agentId?: string }
  | { type: "REQUEST_WALLET" }
  | { type: "STORY_CUTSCENE"; cutsceneId: string; src: string }
  | { type: "STORY_DIALOGUE"; speaker: string; text: string; avatar?: string }
  | { type: "STAGE_COMPLETE"; stageId: string; stars: number; rewards: { gold?: number; xp?: number } };

// Messages received from milaidy -> game
export type HostToGame =
  | { type: "LTCG_AUTH"; authToken: string; agentId?: string }
  | ({ type: "START_MATCH" } & StartMatchPayload)
  | ({ type: "LTCG_START_MATCH" } & StartMatchPayload)
  | { type: "WALLET_CONNECTED"; address: string; chain: string }
  | { type: "SKIP_CUTSCENE"; cutsceneId?: string }
  | { type: "LTCG_SKIP_CUTSCENE"; cutsceneId?: string }
  | { type: "LTCG_CHAT_EVENT"; message: IframeChatMessage }
  | {
      type: "LTCG_CHAT_STATE";
      enabled?: boolean;
      readOnly?: boolean;
      messages?: IframeChatMessage[];
      reason?: string;
    };

/**
 * Check if an origin is allowed to communicate with this app.
 */
function isAllowedOrigin(origin: string): boolean {
  const customOrigin = getEnvString("VITE_MILAIDY_ORIGIN");
  if (customOrigin && origin === customOrigin) return true;
  if (OPAQUE_ORIGINS.has(origin)) return allowOpaqueOrigins();
  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Send a message to the milaidy host app.
 * No-op if not running inside an iframe.
 * 
 * Note: Uses "*" targetOrigin because the game may be embedded
 * in different contexts (local dev, staging, production). The host
 * should validate message source via event.origin.
 */
export function postToHost(message: GameToHost) {
  if (window.self === window.top) return;
  window.parent.postMessage(message, "*");
}

/**
 * Listen for messages from the milaidy host app.
 * Validates message origin before passing to handler.
 * Returns a cleanup function.
 */
export function onHostMessage(
  handler: (message: HostToGame) => void
) {
  const allowedTypes = new Set<HostToGame["type"]>([
    "LTCG_AUTH",
    "START_MATCH",
    "LTCG_START_MATCH",
    "WALLET_CONNECTED",
    "SKIP_CUTSCENE",
    "LTCG_SKIP_CUTSCENE",
    "LTCG_CHAT_EVENT",
    "LTCG_CHAT_STATE",
  ]);

  const listener = (event: MessageEvent) => {
    // Validate origin for security
    if (!isAllowedOrigin(event.origin)) {
      console.warn(`[iframe] Rejected message from unauthorized origin: ${event.origin}`);
      return;
    }

    const data = event.data;
    if (
      data &&
      typeof data === "object" &&
      typeof (data as { type?: unknown }).type === "string" &&
      allowedTypes.has((data as { type: HostToGame["type"] }).type)
    ) {
      handler(data as HostToGame);
    }
  };

  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

/**
 * Signal to milaidy that the game client is ready.
 * Call this once on app mount.
 */
export function signalReady() {
  postToHost({ type: "LTCG_READY" });
}

export function sendChatToHost(payload: {
  text: string;
  matchId?: string;
  agentId?: string;
}) {
  postToHost({
    type: "LTCG_CHAT_SEND",
    text: payload.text,
    matchId: payload.matchId,
    agentId: payload.agentId,
  });
}
