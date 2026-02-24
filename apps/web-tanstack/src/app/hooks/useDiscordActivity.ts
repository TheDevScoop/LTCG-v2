import { useEffect, useState } from "react";
import * as Sentry from "@sentry/react";
import { Events } from "@discord/embedded-app-sdk";
import { isDiscordActivityFrame } from "../lib/clientPlatform";
import { normalizeMatchId } from "../lib/matchIds";

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;
const DISCORD_JOIN_SECRET_PREFIX = "ltcg:match:";
const DISCORD_TOKEN_EXCHANGE_PATH = "/api/discord-token";
const DISCORD_AUTHORIZE_STATE = "ltcg-discord-activity";
const DISCORD_COMMAND_SCOPES: Array<"identify" | "rpc.activities.write"> = [
  "identify",
  "rpc.activities.write",
];

type DiscordSDKInstance = import("@discord/embedded-app-sdk").DiscordSDK;

type DiscordActivityState = {
  isDiscordActivity: boolean;
  sdkReady: boolean;
  pendingJoinMatchId: string | null;
  sdkError: string | null;
};

type DiscordActivitySnapshot = DiscordActivityState & {
  sdk: DiscordSDKInstance | null;
};

let discordSdk: DiscordSDKInstance | null = null;
let initPromise: Promise<void> | null = null;
let commandScopeStatus: "unknown" | "authorized" | "failed" = "unknown";
let commandScopeAuthPromise: Promise<boolean> | null = null;
let commandScopeAuthMode: "silent" | "interactive" | null = null;
let activityState: DiscordActivityState = {
  isDiscordActivity: false,
  sdkReady: false,
  pendingJoinMatchId: null,
  sdkError: null,
};
const listeners = new Set<(state: DiscordActivityState) => void>();

function emitState() {
  for (const listener of listeners) {
    listener(activityState);
  }
}

function setState(patch: Partial<DiscordActivityState>) {
  activityState = {
    ...activityState,
    ...patch,
  };
  emitState();
}

export function decodeDiscordJoinMatchId(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(DISCORD_JOIN_SECRET_PREFIX)) {
    return normalizeMatchId(trimmed.slice(DISCORD_JOIN_SECRET_PREFIX.length));
  }
  return normalizeMatchId(trimmed);
}

export function encodeDiscordJoinSecret(matchId: string) {
  return `${DISCORD_JOIN_SECRET_PREFIX}${matchId}`;
}

function formatErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function parseResponseErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (!payload || typeof payload !== "object") return null;

  const withError = payload as { error?: unknown; message?: unknown };
  if (typeof withError.error === "string" && withError.error.trim()) {
    return withError.error;
  }
  if (typeof withError.message === "string" && withError.message.trim()) {
    return withError.message;
  }

  return null;
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function parseDiscordTokenAccessToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const token = (payload as { access_token?: unknown }).access_token;
  return typeof token === "string" && token.trim() ? token : null;
}

export function getDiscordScopeErrorMessage(error: unknown, interactive: boolean) {
  if (!interactive) {
    return `Discord rich-presence permissions unavailable: ${formatErrorMessage(
      error,
      "Authorization was not granted.",
    )}`;
  }
  return `Discord permission request failed: ${formatErrorMessage(
    error,
    "Unable to request Discord permissions.",
  )}`;
}

async function exchangeDiscordAccessToken(code: string) {
  const response = await fetch(DISCORD_TOKEN_EXCHANGE_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(parseResponseErrorMessage(payload) ?? `Token exchange failed (${response.status})`);
  }

  const accessToken = parseDiscordTokenAccessToken(payload);
  if (!accessToken) {
    throw new Error("Token exchange succeeded but no access token was returned.");
  }

  return accessToken;
}

async function authorizeDiscordCommandScopes(interactive: boolean) {
  const sdk = discordSdk;
  if (!sdk || !activityState.sdkReady || !DISCORD_CLIENT_ID) return false;

  const { code } = await sdk.commands.authorize({
    client_id: DISCORD_CLIENT_ID,
    response_type: "code",
    scope: DISCORD_COMMAND_SCOPES,
    state: DISCORD_AUTHORIZE_STATE,
    prompt: interactive ? undefined : "none",
  });

  const accessToken = await exchangeDiscordAccessToken(code);
  await sdk.commands.authenticate({ access_token: accessToken });
  return true;
}

async function ensureDiscordCommandScopes({ interactive }: { interactive: boolean }) {
  if (!activityState.sdkReady || !discordSdk || !DISCORD_CLIENT_ID) return false;
  if (commandScopeStatus === "authorized") return true;
  if (commandScopeStatus === "failed" && !interactive) return false;

  if (commandScopeAuthPromise) {
    if (!interactive || commandScopeAuthMode === "interactive") {
      return commandScopeAuthPromise;
    }

    const completed = await commandScopeAuthPromise;
    if (completed) return true;
  }

  commandScopeAuthMode = interactive ? "interactive" : "silent";
  commandScopeAuthPromise = (async () => {
    try {
      const success = await authorizeDiscordCommandScopes(interactive);
      commandScopeStatus = success ? "authorized" : "failed";
      if (success) {
        setState({ sdkError: null });
      }
      return success;
    } catch (error) {
      commandScopeStatus = "failed";
      Sentry.captureException(error);
      setState({
        sdkError: getDiscordScopeErrorMessage(error, interactive),
      });
      return false;
    } finally {
      commandScopeAuthPromise = null;
      commandScopeAuthMode = null;
    }
  })();

  return commandScopeAuthPromise;
}

function captureSdkError(error: unknown) {
  Sentry.captureException(error);
  setState({
    sdkError: error instanceof Error ? error.message : "Discord SDK initialization failed.",
  });
}

async function initializeDiscordActivityIfNeeded() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const isDiscordActivity = isDiscordActivityFrame();
    setState({ isDiscordActivity });
    if (!isDiscordActivity) return;

    const clientId = DISCORD_CLIENT_ID;
    if (!clientId) {
      const message = "Discord Activity detected, but VITE_DISCORD_CLIENT_ID is missing.";
      Sentry.captureMessage(message, "warning");
      setState({ sdkError: message });
      return;
    }

    try {
      const { DiscordSDK } = await import("@discord/embedded-app-sdk");
      const sdk = new DiscordSDK(clientId);
      discordSdk = sdk;
      commandScopeStatus = "unknown";
      commandScopeAuthPromise = null;
      commandScopeAuthMode = null;

      await sdk.ready();

      setState({
        sdkReady: true,
        pendingJoinMatchId: decodeDiscordJoinMatchId(sdk.customId),
      });

      await sdk.subscribe(Events.ACTIVITY_JOIN, ({ secret }) => {
        const matchId = decodeDiscordJoinMatchId(secret);
        if (!matchId) return;
        setState({ pendingJoinMatchId: matchId });
      });

      // Non-interactive bootstrap; failures are surfaced as status only.
      void ensureDiscordCommandScopes({ interactive: false });
    } catch (error) {
      captureSdkError(error);
    }
  })();

  return initPromise;
}

export function getDiscordActivitySnapshot(): DiscordActivitySnapshot {
  return {
    ...activityState,
    sdk: discordSdk,
  };
}

export function consumeDiscordPendingJoinMatchId() {
  const matchId = activityState.pendingJoinMatchId;
  if (matchId) {
    setState({ pendingJoinMatchId: null });
  }
  return matchId;
}

export async function setDiscordActivityMatchContext(
  matchId: string,
  context: { mode: "lobby" | "duel"; currentPlayers: number; maxPlayers: number; state: string },
) {
  const sdk = discordSdk;
  if (!sdk || !activityState.sdkReady) return false;
  if (!(await ensureDiscordCommandScopes({ interactive: false }))) return false;

  try {
    await sdk.commands.setActivity({
      activity: {
        type: 0,
        details: context.mode === "lobby" ? "In Duel Lobby" : "In Duel",
        state: context.state,
        party: {
          id: matchId,
          size: [Math.max(1, context.currentPlayers), Math.max(1, context.maxPlayers)],
        },
        secrets: {
          join: encodeDiscordJoinSecret(matchId),
          match: encodeDiscordJoinSecret(matchId),
        },
        instance: true,
      },
    });
    return true;
  } catch (error) {
    captureSdkError(error);
    return false;
  }
}

export async function shareDiscordMatchInvite(matchId: string, message?: string) {
  const sdk = discordSdk;
  if (!sdk || !activityState.sdkReady) return null;

  try {
    return await sdk.commands.shareLink({
      message: message ?? "Join my Lunch Table duel in Discord.",
      custom_id: matchId,
    });
  } catch (error) {
    captureSdkError(error);
    return null;
  }
}

/**
 * Initializes Discord's Embedded App SDK when the app is loaded
 * as a Discord Activity iframe and exposes join/invite state.
 */
export function useDiscordActivity() {
  const [state, setLocalState] = useState<DiscordActivityState>(activityState);

  useEffect(() => {
    listeners.add(setLocalState);
    void initializeDiscordActivityIfNeeded();
    return () => {
      listeners.delete(setLocalState);
    };
  }, []);

  return state;
}
