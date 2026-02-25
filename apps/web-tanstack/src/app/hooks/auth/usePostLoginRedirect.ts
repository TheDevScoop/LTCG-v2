import { useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "@/router/react-router";
import { usePrivy } from "@privy-io/react-auth";
import { PRIVY_ENABLED } from "@/lib/auth/privyEnv";

const REDIRECT_KEY = "ltcg_redirect";

/**
 * After Privy login completes on a public page (e.g. Home),
 * check for a saved redirect and navigate there.
 *
 * The redirect stays in sessionStorage so that AuthGuard → Onboarding
 * can consume it after onboarding completes. It's only removed
 * by the final consumer (Onboarding or AuthGuard).
 */
export function usePostLoginRedirect() {
  const { authenticated } = PRIVY_ENABLED
    ? usePrivy()
    : { authenticated: false };
  const navigate = useNavigate();
  const location = useLocation();
  const fired = useRef(false);

  const consumeAndRedirect = useCallback(() => {
    if (fired.current) return;

    const path = peekRedirect();
    if (path && path !== currentPathname(location)) {
      fired.current = true;
      navigate(path);
    } else if (path === currentPathname(location)) {
      clearRedirect();
    }
  }, [navigate, location]);

  useEffect(() => {
    if (!authenticated) return;
    consumeAndRedirect();
  }, [authenticated, consumeAndRedirect]);

  // Reset fired ref on navigation to allow redirects for subsequent logins
  useEffect(() => {
    fired.current = false;
  }, [location.pathname, location.search, location.hash]);
}

/** Store a redirect path before triggering login. */
export function storeRedirect(path: string) {
  sessionStorage.setItem(REDIRECT_KEY, path);
}

/** Read redirect path without removing it. */
export function peekRedirect() {
  return sessionStorage.getItem(REDIRECT_KEY);
}

/** Remove stored redirect path. */
export function clearRedirect() {
  sessionStorage.removeItem(REDIRECT_KEY);
}

/** Read and remove the redirect path (call at the end of a flow). */
export function consumeRedirect() {
  const path = peekRedirect();
  if (path) clearRedirect();
  return path;
}

export function currentPathname(location: {
  pathname: string;
  search?: string;
  hash?: string;
}) {
  return `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
}
