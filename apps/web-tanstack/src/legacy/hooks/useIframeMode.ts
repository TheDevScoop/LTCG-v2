import { useCallback, useEffect, useRef, useState } from "react";
import {
  signalReady,
  onHostMessage,
  type HostToGame,
  type IframeChatMessage,
  type StartMatchPayload,
} from "@/lib/iframe";
import { isDiscordActivityFrame } from "@/lib/clientPlatform";

export type IframeChatState = {
  enabled: boolean;
  readOnly: boolean;
  messages: IframeChatMessage[];
  reason?: string;
};

export function deriveIframeEmbedFlags({
  isInIframe,
  hasEmbedParam,
  isDiscordActivity,
}: {
  isInIframe: boolean;
  hasEmbedParam: boolean;
  isDiscordActivity: boolean;
}) {
  // Discord Activities run in an iframe too, but host messaging here is meant
  // only for the milaidy embed bridge.
  const isEmbedded = hasEmbedParam || (isInIframe && !isDiscordActivity);
  return { isEmbedded };
}

export function deriveDevAgentApiKey({
  isDev,
  hostname,
  searchParams,
  envApiKey,
}: {
  isDev: boolean;
  hostname: string;
  searchParams: URLSearchParams;
  envApiKey: string | null | undefined;
}) {
  if (!isDev) return null;
  const normalizedHost = hostname.toLowerCase();
  const isLocalHost = normalizedHost === "localhost" || normalizedHost === "127.0.0.1";
  if (!isLocalHost) return null;

  const devAgentFlag = searchParams.get("devAgent");
  const devAgentEnabled = devAgentFlag === "1" || devAgentFlag === "true";
  if (!devAgentEnabled) return null;

  const apiKey = (envApiKey ?? "").trim();
  if (!apiKey.startsWith("ltcg_")) return null;
  return apiKey;
}

export function classifyHostAuthToken(authToken: string | null) {
  return {
    isApiKey: authToken?.startsWith("ltcg_") ?? false,
    isJwt: authToken ? looksLikeJWT(authToken) : false,
  };
}

/**
 * Detect if the app is running inside an iframe (milaidy) or with
 * ?embedded=true query param, and manage the postMessage handshake.
 *
 * Auth tokens are classified:
 * - JWT (3 dot-separated base64 segments) → used for Convex real-time auth
 * - ltcg_ API key → used for HTTP API spectator mode
 */
export function useIframeMode() {
  const isInIframe =
    typeof window !== "undefined" && window.self !== window.top;
  const hasEmbedParam =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("embedded") === "true";
  const isDiscordActivity =
    typeof window !== "undefined" && isDiscordActivityFrame();
  const { isEmbedded } = deriveIframeEmbedFlags({
    isInIframe,
    hasEmbedParam,
    isDiscordActivity,
  });

  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const devAgentApiKey = deriveDevAgentApiKey({
    isDev: import.meta.env.DEV,
    hostname: typeof window !== "undefined" ? window.location.hostname : "",
    searchParams,
    envApiKey: import.meta.env.VITE_DEV_AGENT_API_KEY,
  });

  const [authToken, setAuthToken] = useState<string | null>(devAgentApiKey);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [startMatchCommand, setStartMatchCommand] = useState<StartMatchPayload | null>(null);
  const [skipCutsceneVersion, setSkipCutsceneVersion] = useState(0);
  const [chatState, setChatState] = useState<IframeChatState | null>(null);
  const [chatEvent, setChatEvent] = useState<IframeChatMessage | null>(null);
  const signaled = useRef(false);
  const clearStartMatchCommand = useCallback(() => setStartMatchCommand(null), []);

  useEffect(() => {
    if (!isEmbedded) return;

    // Signal ready once (only meaningful inside an iframe)
    if (isInIframe && !signaled.current) {
      signalReady();
      signaled.current = true;
    }

    // Listen for auth from host
    return onHostMessage((msg: HostToGame) => {
      if (msg.type === "LTCG_AUTH") {
        setAuthToken(msg.authToken);
        if (msg.agentId) setAgentId(msg.agentId);
        return;
      }

      if (msg.type === "START_MATCH" || msg.type === "LTCG_START_MATCH") {
        setStartMatchCommand({
          mode: msg.mode === "pvp" ? "pvp" : "story",
          matchId: typeof msg.matchId === "string" ? msg.matchId : undefined,
          chapterId: typeof msg.chapterId === "string" ? msg.chapterId : undefined,
          stageNumber: typeof msg.stageNumber === "number" ? msg.stageNumber : undefined,
        });
        return;
      }

      if (msg.type === "SKIP_CUTSCENE" || msg.type === "LTCG_SKIP_CUTSCENE") {
        setSkipCutsceneVersion((current) => current + 1);
        return;
      }

      if (msg.type === "LTCG_CHAT_STATE") {
        setChatState({
          enabled: msg.enabled !== false,
          readOnly: msg.readOnly === true,
          messages: Array.isArray(msg.messages) ? msg.messages : [],
          reason: typeof msg.reason === "string" ? msg.reason : undefined,
        });
        return;
      }

      if (msg.type === "LTCG_CHAT_EVENT") {
        setChatEvent(msg.message);
      }
    });
  }, [isEmbedded, isInIframe]);

  // Classify the token type
  const { isApiKey, isJwt } = classifyHostAuthToken(authToken);

  return {
    isEmbedded,
    authToken,
    agentId,
    startMatchCommand,
    clearStartMatchCommand,
    skipCutsceneVersion,
    chatState,
    chatEvent,
    /** True when the token is an ltcg_ API key (spectator mode) */
    isApiKey,
    /** True when the token is a Privy JWT (full Convex auth) */
    isJwt,
  };
}

/** Check if a token looks like a JWT (3 dot-separated base64 segments) */
export function looksLikeJWT(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  return parts.every((part) => base64urlPattern.test(part));
}
