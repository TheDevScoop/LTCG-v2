/**
 * milaidy iframe integration
 *
 * Handles postMessage communication between the LTCG game client
 * and the milaidy Electron host app.
 */

// Allowed origins for incoming messages from the host app
// Configure via environment variable: VITE_MILAIDY_ORIGIN
const ALLOWED_ORIGINS = [
  "http://localhost:3000",  // milaidy local dev
  "http://localhost:3334",  // LTCG dev server (self-embed testing)
  "https://milaidy.app",    // Production
  "https://app.milaidy.xyz", // Alternative domain
  "file://",                 // Electron file:// origin
];

// Messages sent from game -> milaidy
export type GameToHost =
  | { type: "LTCG_READY" }
  | { type: "RPG_READY"; schemaVersion: "1.0.0" }
  | { type: "MATCH_STARTED"; matchId: string }
  | { type: "MATCH_ENDED"; result: "win" | "loss" | "draw" }
  | { type: "REQUEST_WALLET" }
  | { type: "STORY_CUTSCENE"; cutsceneId: string; src: string }
  | { type: "STORY_DIALOGUE"; speaker: string; text: string; avatar?: string }
  | { type: "STAGE_COMPLETE"; stageId: string; stars: number; rewards: { gold?: number; xp?: number } }
  | { type: "RPG_SESSION_STARTED"; sessionId: string; worldId: string }
  | { type: "RPG_SESSION_ENDED"; sessionId: string; reason?: string };

// Messages received from milaidy -> game
export type HostToGame =
  | { type: "LTCG_AUTH"; authToken: string; agentId?: string }
  | { type: "START_MATCH"; mode: "story" | "pvp" }
  | { type: "WALLET_CONNECTED"; address: string; chain: string }
  | { type: "SKIP_CUTSCENE" }
  | { type: "START_RPG_SESSION"; worldId: string; sessionId?: string; mode?: "2d" | "3d" | "hybrid" };

/**
 * Check if an origin is allowed to communicate with this app.
 */
function isAllowedOrigin(origin: string): boolean {
  const customOrigin = import.meta.env.VITE_MILAIDY_ORIGIN as string | undefined;
  if (customOrigin && origin === customOrigin) return true;
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
  const listener = (event: MessageEvent) => {
    // Validate origin for security
    if (!isAllowedOrigin(event.origin)) {
      console.warn(`[iframe] Rejected message from unauthorized origin: ${event.origin}`);
      return;
    }

    const data = event.data;
    if (
      data &&
      typeof data.type === "string" &&
      (data.type.startsWith("LTCG_") ||
      data.type.startsWith("RPG_")) ||
      data?.type === "START_MATCH" ||
      data?.type === "WALLET_CONNECTED" ||
      data?.type === "START_RPG_SESSION"
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
