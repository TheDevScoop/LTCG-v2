import { usePrivy } from "@privy-io/react-auth";
import { useNavigate, useLocation } from "react-router";
import { useUserSync } from "@/hooks/auth/useUserSync";
import type { ReactNode } from "react";
import { useEffect } from "react";

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Auth gate for protected routes.
 *
 * 1. Not authenticated → redirect to / (home has login buttons)
 * 2. Authenticated, syncing → loading spinner
 * 3. Needs onboarding → redirect to /onboarding
 * 4. Ready → render children
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { ready, authenticated } = usePrivy();
  const { isLoading, needsOnboarding } = useUserSync();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      navigate("/", { replace: true });
      return;
    }

    if (needsOnboarding && location.pathname !== "/onboarding") {
      navigate("/onboarding", { replace: true });
    }
  }, [ready, authenticated, needsOnboarding, navigate, location.pathname]);

  if (!ready) {
    return <AuthLoadingScreen message="Checking sign-in..." />;
  }

  if (!authenticated) return null;

  if (isLoading) {
    return <AuthLoadingScreen message="Entering the halls..." />;
  }

  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <AuthLoadingScreen message="Completing setup..." />;
  }

  return <>{children}</>;
}

function AuthLoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0a09]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-[#ffcc00] border-t-transparent rounded-full animate-spin" />
        <p
          className="text-[#a89f94] text-sm uppercase tracking-widest font-bold"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          {message}
        </p>
      </div>
    </div>
  );
}
