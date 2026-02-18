import { usePrivy } from "@privy-io/react-auth";
import { useConvexAuth } from "convex/react";
import * as Sentry from "@sentry/react";
import { useEffect, useRef, useState } from "react";
import { apiAny, useConvexMutation, useConvexQuery } from "@/lib/convexHelpers";
import { shouldWaitForConvexAuth } from "./userSyncFlags";

/**
 * Post-login user sync hook.
 * Ensures a Convex user record exists after Privy authentication,
 * and tracks onboarding progress.
 */
export function useUserSync() {
  const { authenticated, user: privyUser } = usePrivy();
  const { isAuthenticated: convexReady } = useConvexAuth();

  const syncUser = useConvexMutation(apiAny.auth.syncUser);
  const onboardingStatus = useConvexQuery(
    apiAny.auth.getOnboardingStatus,
    convexReady ? {} : "skip",
  );

  const synced = useRef(false);
  const [syncInFlight, setSyncInFlight] = useState(false);

  useEffect(() => {
    if (!authenticated || !convexReady || synced.current || syncInFlight) return;
    if (onboardingStatus === undefined) return; // still loading
    if (onboardingStatus === null) return;

    // User already exists in DB
    if (onboardingStatus?.exists) {
      synced.current = true;
      return;
    }

    // Create user record
    setSyncInFlight(true);
    syncUser({ email: privyUser?.email?.address })
      .then(() => {
        synced.current = true;
      })
      .catch((err: unknown) => {
        Sentry.captureException(err);
      })
      .finally(() => {
        setSyncInFlight(false);
      });
  }, [authenticated, convexReady, onboardingStatus, syncUser, privyUser, syncInFlight]);

  const waitingForOnboardingStatus =
    authenticated && convexReady && onboardingStatus === undefined;
  const waitingForUserBootstrap =
    authenticated &&
    convexReady &&
    (syncInFlight || onboardingStatus?.exists === false);
  const waitingForConvexAuth = shouldWaitForConvexAuth({
    privyAuthenticated: authenticated,
    convexIsAuthenticated: convexReady,
  });
  const isLoading =
    waitingForConvexAuth || waitingForOnboardingStatus || waitingForUserBootstrap;

  const needsOnboarding =
    onboardingStatus?.exists === true &&
    (!onboardingStatus.hasUsername || !onboardingStatus.hasStarterDeck);

  const isReady =
    onboardingStatus?.exists &&
    onboardingStatus.hasUsername &&
    onboardingStatus.hasStarterDeck;

  return {
    isLoading,
    needsOnboarding,
    isReady,
    onboardingStatus,
  };
}
