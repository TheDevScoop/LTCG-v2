import { useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router";
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

  // Clear redirect when already authenticated (user can navigate freely)
  useEffect(() => {
    if (authenticated) {
      sessionStorage.removeItem(REDIRECT_KEY);
    }
  }, [authenticated]);

  const consumeAndRedirect = useCallback(() => {
    if (fired.current) return;
    
    const path = sessionStorage.getItem(REDIRECT_KEY);
    if (path && path !== location.pathname) {
      fired.current = true;
      sessionStorage.removeItem(REDIRECT_KEY);
      navigate(path);
    } else if (path === location.pathname) {
      sessionStorage.removeItem(REDIRECT_KEY);
    }
  }, [navigate, location.pathname]);

  useEffect(() => {
    if (!authenticated) return;
    consumeAndRedirect();
  }, [authenticated, consumeAndRedirect]);

  // Reset fired ref on navigation to allow redirects for subsequent logins
  useEffect(() => {
    fired.current = false;
  }, [location.pathname]);
}

/** Store a redirect path before triggering login. */
export function storeRedirect(path: string) {
  sessionStorage.setItem(REDIRECT_KEY, path);
}

/** Read and remove the redirect path (call at the end of a flow). */
export function consumeRedirect() {
  const path = sessionStorage.getItem(REDIRECT_KEY);
  if (path) sessionStorage.removeItem(REDIRECT_KEY);
  return path;
}
