/**
 * Avoid rendering the app while Privy is authenticated but Convex hasn't
 * established an authenticated session yet. Mutations will fail with
 * "Not authenticated" otherwise (commonly during onboarding).
 */
export function shouldWaitForConvexAuth({
  privyAuthenticated,
  convexIsAuthenticated,
}: {
  privyAuthenticated: boolean;
  convexIsAuthenticated: boolean;
}) {
  return privyAuthenticated && !convexIsAuthenticated;
}

