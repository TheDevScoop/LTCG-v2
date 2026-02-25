import { useMemo } from "react";
import { useNavigate } from "@/router/react-router";
import { useConvexAuth } from "convex/react";
import { motion } from "framer-motion";
import { apiAny, useConvexQuery } from "@/lib/convexHelpers";
import { blob } from "@/lib/blobUrls";
import { DEFAULT_SIGNUP_AVATAR_PATH } from "@/lib/signupAvatarCatalog";
import { TrayNav } from "@/components/layout/TrayNav";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type CurrentUser = {
  username: string;
  name?: string;
  email?: string;
  avatarPath?: string;
  createdAt?: number;
  activeDeckId?: string;
};

type Deck = {
  deckId: string;
  name?: string;
};

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(timestamp);
}

function formatJoinedTime(timestamp: number | undefined): string {
  if (!timestamp) return "Unknown";
  return formatDate(timestamp);
}

function RevealSection({ children, index, className }: { children: React.ReactNode; index: number; className?: string }) {
  const { ref, inView, delay } = useScrollReveal({ index });
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "none" : "translateY(20px)",
        transition: `opacity 0.5s ease ${delay}s, transform 0.5s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

export function Profile() {
  const { isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();

  const currentUser = useConvexQuery(
    apiAny.auth.currentUser,
    isAuthenticated ? {} : "skip",
  ) as CurrentUser | null | undefined;

  const decks = useConvexQuery(
    apiAny.game.getUserDecks,
    isAuthenticated ? {} : "skip",
  ) as Deck[] | undefined;

  const userDeckCount = useMemo(() => decks?.length ?? 0, [decks]);
  const hasDecks = decks !== undefined;

  if (currentUser === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
        <div className="w-10 h-10 border-4 border-[#ffcc00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#fdfdfb] px-6 py-10">
        <div className="paper-panel p-8 text-center max-w-md mx-auto">
          <h1
            className="text-2xl font-black uppercase tracking-tighter mb-3"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            User Record Missing
          </h1>
          <p
            className="text-[#666] text-sm mb-6"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            Your account is still being synced. If this persists, sign out and back in.
          </p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="tcg-button px-5 py-2.5"
          >
            Return Home
          </button>
        </div>
        <TrayNav />
      </div>
    );
  }

  const joinedOn = formatJoinedTime(currentUser.createdAt);
  const displayName = currentUser.name || currentUser.username || "Player";
  const avatarUrl = blob(currentUser.avatarPath ?? DEFAULT_SIGNUP_AVATAR_PATH);

  return (
    <main className="min-h-screen bg-[#fdfdfb] px-4 py-10 pb-24">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="text-center">
          <motion.h1
            className="text-4xl md:text-5xl tracking-tighter uppercase"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            Player Profile
          </motion.h1>
          <motion.p
            className="text-[#666] mt-2"
            style={{ fontFamily: "Special Elite, cursive" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            View your account details and quick status.
          </motion.p>
          <motion.button
            type="button"
            onClick={() => navigate("/settings")}
            className="mt-5 tcg-button-primary px-6 py-2.5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            Edit Profile
          </motion.button>
        </header>

        <RevealSection index={0} className="paper-panel p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            <div className="shrink-0 relative">
              <div className="absolute -inset-1 bg-[#ffcc00]/30 animate-effect-pulse" />
              <img
                src={avatarUrl}
                alt={`${displayName} avatar`}
                className="relative w-28 h-28 object-cover border-2 border-[#121212]"
                loading="lazy"
              />
            </div>

            <div className="flex-1 min-w-0">
              <h2
                className="text-3xl md:text-4xl mb-2"
                style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
              >
                {displayName}
              </h2>
              {currentUser.name ? (
                <p
                  className="text-[#666] text-sm uppercase tracking-wide"
                  style={{ fontFamily: "Special Elite, cursive" }}
                >
                  {currentUser.name}
                </p>
              ) : null}

              <div className="mt-4 space-y-2 text-sm text-[#121212]">
                <p>
                  <span className="font-black uppercase tracking-wide">Email:</span> {currentUser.email ?? "Not set"}
                </p>
                <p>
                  <span className="font-black uppercase tracking-wide">Joined:</span> {joinedOn}
                </p>
                <p>
                  <span className="font-black uppercase tracking-wide">Current Deck:</span> {currentUser.activeDeckId ? "Assigned" : "Not set"}
                </p>
              </div>
            </div>
          </div>
        </RevealSection>

        <RevealSection index={1} className="grid gap-4 md:grid-cols-2">
          <article className="paper-panel p-5">
            <h3
              className="text-lg font-black uppercase tracking-wide mb-2"
              style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
            >
              Decks
            </h3>
            <p className="text-sm text-[#666]">
              {hasDecks ? (
                <>
                  You currently own <strong>{userDeckCount}</strong> deck{userDeckCount === 1 ? "" : "s"}.
                </>
              ) : (
                "Loading deck data..."
              )}
            </p>
            <button
              type="button"
              onClick={() => navigate("/decks")}
              className="mt-4 tcg-button px-4 py-2 text-xs hover:-translate-y-0.5 hover:shadow-zine"
            >
              Open Decks
            </button>
          </article>

          <article className="paper-panel p-5">
            <h3
              className="text-lg font-black uppercase tracking-wide mb-2"
              style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
            >
              Quick Actions
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate("/collection")}
                className="tcg-button px-4 py-2 text-xs hover:-translate-y-0.5 hover:shadow-zine"
              >
                Open Collection
              </button>
              <button
                type="button"
                onClick={() => navigate("/leaderboard")}
                className="tcg-button px-4 py-2 text-xs hover:-translate-y-0.5 hover:shadow-zine"
              >
                View Leaderboard
              </button>
              <button
                type="button"
                onClick={() => navigate("/cliques")}
                className="tcg-button px-4 py-2 text-xs hover:-translate-y-0.5 hover:shadow-zine"
              >
                Open Cliques
              </button>
            </div>
          </article>
        </RevealSection>
      </div>

      <TrayNav />
    </main>
  );
}
