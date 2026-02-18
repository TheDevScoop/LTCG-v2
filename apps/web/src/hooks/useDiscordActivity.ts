import { useEffect, useState } from "react";
import * as Sentry from "@sentry/react";
import { Events } from "@discord/embedded-app-sdk";
import { isDiscordActivityFrame } from "../lib/clientPlatform";
import { normalizeMatchId } from "../lib/matchIds";

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;
const DISCORD_JOIN_SECRET_PREFIX = "ltcg:match:";

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
