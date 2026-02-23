import { describe, expect, it, vi } from "vitest";
import {
  derivePrivyAuthBridgeState,
  resolvePrivyConvexAccessToken,
} from "./usePrivyAuthForConvex";

describe("derivePrivyAuthBridgeState", () => {
  it("marks iframe JWT mode as authenticated and not loading", () => {
    expect(
      derivePrivyAuthBridgeState({
        isEmbedded: true,
        isJwt: true,
        isApiKey: false,
        ready: false,
        authenticated: false,
      }),
    ).toEqual({
      hasIframeJwtAuth: true,
      isSpectatorMode: false,
      isLoading: false,
      isAuthenticated: true,
    });
  });

  it("marks iframe API-key mode as spectator and not authenticated", () => {
    expect(
      derivePrivyAuthBridgeState({
        isEmbedded: true,
        isJwt: false,
        isApiKey: true,
        ready: true,
        authenticated: true,
      }),
    ).toEqual({
      hasIframeJwtAuth: false,
      isSpectatorMode: true,
      isLoading: false,
      isAuthenticated: false,
    });
  });

  it("uses browser auth state when not embedded", () => {
    expect(
      derivePrivyAuthBridgeState({
        isEmbedded: false,
        isJwt: false,
        isApiKey: false,
        ready: false,
        authenticated: true,
      }),
    ).toEqual({
      hasIframeJwtAuth: false,
      isSpectatorMode: false,
      isLoading: true,
      isAuthenticated: true,
    });
  });
});

describe("resolvePrivyConvexAccessToken", () => {
  it("returns iframe token in JWT mode", async () => {
    const token = await resolvePrivyConvexAccessToken({
      isSpectatorMode: false,
      hasIframeJwtAuth: true,
      iframeToken: "header.payload.signature",
      authenticated: false,
      getAccessToken: vi.fn(async () => "unused"),
      captureException: vi.fn(),
    });
    expect(token).toBe("header.payload.signature");
  });

  it("returns null for spectator API-key mode", async () => {
    const token = await resolvePrivyConvexAccessToken({
      isSpectatorMode: true,
      hasIframeJwtAuth: false,
      iframeToken: "ltcg_test_key",
      authenticated: true,
      getAccessToken: vi.fn(async () => "unused"),
      captureException: vi.fn(),
    });
    expect(token).toBeNull();
  });

  it("uses browser getAccessToken when authenticated", async () => {
    const getAccessToken = vi.fn(async () => "privy_access_token");
    const token = await resolvePrivyConvexAccessToken({
      isSpectatorMode: false,
      hasIframeJwtAuth: false,
      iframeToken: null,
      authenticated: true,
      getAccessToken,
      captureException: vi.fn(),
    });
    expect(token).toBe("privy_access_token");
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("captures and suppresses token-fetch errors", async () => {
    const captureException = vi.fn();
    const token = await resolvePrivyConvexAccessToken({
      isSpectatorMode: false,
      hasIframeJwtAuth: false,
      iframeToken: null,
      authenticated: true,
      getAccessToken: vi.fn(async () => {
        throw new Error("token failed");
      }),
      captureException,
    });
    expect(token).toBeNull();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
