import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useMemo } from "react";
import * as Sentry from "@sentry/react";
import { useIframeMode } from "@/hooks/useIframeMode";

export function derivePrivyAuthBridgeState(args: {
  isEmbedded: boolean;
  isJwt: boolean;
  isApiKey: boolean;
  ready: boolean;
  authenticated: boolean;
}) {
  const hasIframeJwtAuth = args.isEmbedded && args.isJwt;
  const isSpectatorMode = args.isEmbedded && args.isApiKey;
  return {
    hasIframeJwtAuth,
    isSpectatorMode,
    isLoading: hasIframeJwtAuth || isSpectatorMode ? false : !args.ready,
    isAuthenticated: hasIframeJwtAuth ? true : isSpectatorMode ? false : args.authenticated,
  };
}

export async function resolvePrivyConvexAccessToken(args: {
  isSpectatorMode: boolean;
  hasIframeJwtAuth: boolean;
  iframeToken: string | null;
  authenticated: boolean;
  getAccessToken: () => Promise<string | null>;
  captureException: (error: unknown) => void;
}) {
  if (args.isSpectatorMode) return null;
  if (args.hasIframeJwtAuth) return args.iframeToken;
  if (!args.authenticated) return null;

  try {
    return await args.getAccessToken();
  } catch (err) {
    args.captureException(err);
    return null;
  }
}

/**
 * Bridges authentication to Convex.
 * Returns the interface expected by ConvexProviderWithAuth.
 *
 * Three auth paths:
 * 1. Iframe + JWT — host sends Privy JWT via postMessage → full Convex auth
 * 2. Iframe + API key — host sends ltcg_ key → spectator mode (no Convex auth)
 * 3. Browser — user logs in via Privy, SDK provides JWT
 *
 * When an ltcg_ API key is received, we skip Convex auth entirely.
 * The spectator components use the HTTP API directly instead.
 */
export function usePrivyAuthForConvex() {
  const { isEmbedded, authToken: iframeToken, isJwt, isApiKey } = useIframeMode();
  const { ready, authenticated, getAccessToken } = usePrivy();
  const bridgeState = derivePrivyAuthBridgeState({
    isEmbedded,
    isJwt,
    isApiKey,
    ready,
    authenticated,
  });

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken: _ }: { forceRefreshToken: boolean }) => {
      return await resolvePrivyConvexAccessToken({
        isSpectatorMode: bridgeState.isSpectatorMode,
        hasIframeJwtAuth: bridgeState.hasIframeJwtAuth,
        iframeToken,
        authenticated,
        getAccessToken,
        captureException: Sentry.captureException,
      });
    },
    [bridgeState.hasIframeJwtAuth, bridgeState.isSpectatorMode, iframeToken, getAccessToken, authenticated],
  );

  return useMemo(
    () => ({
      isLoading: bridgeState.isLoading,
      isAuthenticated: bridgeState.isAuthenticated,
      fetchAccessToken,
    }),
    [bridgeState.isAuthenticated, bridgeState.isLoading, fetchAccessToken],
  );
}
