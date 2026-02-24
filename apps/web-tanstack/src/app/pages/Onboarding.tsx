import { useState, useCallback } from "react";
import { useNavigate } from "@/router/react-router";
import { useConvexAuth } from "convex/react";
import * as Sentry from "@sentry/react";
import { motion, AnimatePresence } from "framer-motion";
import { apiAny, useConvexMutation, useConvexQuery } from "@/lib/convexHelpers";
import { useUserSync } from "@/hooks/auth/useUserSync";
import { consumeRedirect } from "@/hooks/auth/usePostLoginRedirect";
import { LANDING_BG } from "@/lib/blobUrls";
import {
  DEFAULT_SIGNUP_AVATAR_PATH,
  SIGNUP_AVATAR_OPTIONS,
  type SignupAvatarPath,
} from "@/lib/signupAvatarCatalog";
import { AmbientBackground } from "@/components/ui/AmbientBackground";

// ── Types ─────────────────────────────────────────────────────────

interface StarterDeck {
  name: string;
  deckCode: string;
  archetype: string;
  description: string;
  playstyle: string;
  cardCount: number;
}

const ARCHETYPE_COLORS: Record<string, string> = {
  dropouts: "#e53e3e",
  preps: "#3182ce",
  geeks: "#d69e2e",
  freaks: "#805ad5",
  nerds: "#38a169",
  goodies: "#a0aec0",
};

const ARCHETYPE_EMOJI: Record<string, string> = {
  dropouts: "\u{1F525}",
  preps: "\u{1F451}",
  geeks: "\u{1F4BB}",
  freaks: "\u{1F47B}",
  nerds: "\u{1F4DA}",
  goodies: "\u{2728}",
};

// ── Main Component ────────────────────────────────────────────────

export function Onboarding() {
  const navigate = useNavigate();
  const { onboardingStatus } = useUserSync();
  const { isAuthenticated } = useConvexAuth();

  const setUsernameMutation = useConvexMutation(apiAny.auth.setUsername);
  const setAvatarPathMutation = useConvexMutation(apiAny.auth.setAvatarPath);
  const selectStarterDeckMutation = useConvexMutation(apiAny.game.selectStarterDeck);
  const starterDecks = useConvexQuery(apiAny.game.getStarterDecks, isAuthenticated ? {} : "skip") as
    | StarterDeck[]
    | undefined;

  // Determine which step we're on based on onboarding status
  const needsUsername = onboardingStatus && !onboardingStatus.hasUsername;
  const needsAvatar =
    onboardingStatus &&
    onboardingStatus.hasUsername &&
    !onboardingStatus.hasAvatar;
  const needsDeck =
    onboardingStatus &&
    onboardingStatus.hasUsername &&
    onboardingStatus.hasAvatar &&
    !onboardingStatus.hasStarterDeck;

  const handleUsernameComplete = useCallback(() => {
    // onboardingStatus will reactively update
  }, []);

  const handleAvatarComplete = useCallback(() => {
    // onboardingStatus will reactively update
  }, []);

  const handleDeckComplete = useCallback(() => {
    navigate(consumeRedirect() ?? "/");
  }, [navigate]);

  // Loading state
  if (!onboardingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0a09]">
        <div className="w-10 h-10 border-4 border-[#ffcc00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Already complete — redirect to saved destination or home
  if (onboardingStatus.hasUsername && onboardingStatus.hasStarterDeck) {
    navigate(consumeRedirect() ?? "/", { replace: true });
    return null;
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-cover bg-center relative"
      style={{ backgroundImage: `url('${LANDING_BG}')` }}
    >
      <div className="absolute inset-0 bg-black/60" />
      <AmbientBackground variant="dark" />

      <div className="relative z-10 w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <motion.h1
            className="text-5xl md:text-6xl text-white mb-3 drop-shadow-[3px_3px_0px_rgba(0,0,0,1)]"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            WELCOME TO THE TABLE
          </motion.h1>
          <motion.p
            className="text-[#ffcc00] text-lg drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]"
            style={{ fontFamily: "Special Elite, cursive" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {needsUsername
              ? "Step 1 of 3: Choose your name"
              : needsAvatar
                ? "Step 2 of 3: Pick your avatar"
                : "Step 3 of 3: Pick your deck"}
          </motion.p>
        </div>

        {/* Ink progress bar */}
        <div className="mb-6 mx-auto max-w-md">
          <div className="h-1 bg-white/20 border border-white/10">
            <motion.div
              className="h-full bg-[#ffcc00]"
              initial={{ width: "0%" }}
              animate={{ width: needsUsername ? "33%" : needsAvatar ? "66%" : "100%" }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {needsUsername && (
            <motion.div
              key="username"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <UsernameStep
                setUsernameMutation={setUsernameMutation}
                onComplete={handleUsernameComplete}
              />
            </motion.div>
          )}
          {needsAvatar && (
            <motion.div
              key="avatar"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <AvatarSelectionStep
                setAvatarPathMutation={setAvatarPathMutation}
                onComplete={handleAvatarComplete}
              />
            </motion.div>
          )}
          {needsDeck && (
            <motion.div
              key="deck"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <DeckSelectionStep
                decks={starterDecks}
                selectDeckMutation={selectStarterDeckMutation}
                onComplete={handleDeckComplete}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Step 1: Username ──────────────────────────────────────────────

function UsernameStep({
  setUsernameMutation,
  onComplete,
}: {
  setUsernameMutation: (args: { username: string }) => Promise<{ success: boolean }>;
  onComplete: () => void;
}) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(trimmed)) {
      setError("3-20 characters, letters, numbers, and underscores only.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await setUsernameMutation({ username: trimmed });
      onComplete();
    } catch (err: any) {
      Sentry.captureException(err);
      setError(err.message ?? "Failed to set username.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="paper-panel p-8 md:p-12 mx-auto max-w-md">
      <h2
        className="text-2xl mb-6 text-center"
        style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
      >
        CHOOSE YOUR NAME
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="xX_Shadow_Xx"
          maxLength={20}
          className="w-full px-4 py-3 border-2 border-[#121212] bg-white text-[#121212] text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#ffcc00]"
          style={{ fontFamily: "Outfit, sans-serif" }}
          disabled={submitting}
          autoFocus
        />

        <p
          className="text-xs text-[#666] uppercase tracking-wide"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          3-20 characters. Letters, numbers, underscores.
        </p>

        {error && (
          <p className="text-red-600 text-sm font-bold uppercase">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || username.trim().length < 3}
          className="tcg-button-primary px-8 py-3 text-lg uppercase disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Saving..." : "Claim Name"}
        </button>
      </form>
    </div>
  );
}

// ── Step 2: Avatar Selection ──────────────────────────────────────

function AvatarSelectionStep({
  setAvatarPathMutation,
  onComplete,
}: {
  setAvatarPathMutation: (args: { avatarPath: string }) => Promise<{ success: boolean; avatarPath: string }>;
  onComplete: () => void;
}) {
  const [selectedAvatarPath, setSelectedAvatarPath] =
    useState<SignupAvatarPath>(DEFAULT_SIGNUP_AVATAR_PATH);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleContinue = async () => {
    setSubmitting(true);
    setError("");
    try {
      await setAvatarPathMutation({ avatarPath: selectedAvatarPath });
      onComplete();
    } catch (err: any) {
      Sentry.captureException(err);
      setError(err.message ?? "Failed to save avatar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="paper-panel p-6 md:p-8 mx-auto max-w-5xl">
      <h2
        className="text-2xl md:text-3xl mb-6 text-center"
        style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
      >
        PICK YOUR PROFILE AVATAR
      </h2>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4 max-h-[56vh] overflow-y-auto p-1 mb-6">
        {SIGNUP_AVATAR_OPTIONS.map((avatar) => {
          const selected = selectedAvatarPath === avatar.path;
          return (
            <button
              key={avatar.id}
              type="button"
              onClick={() => setSelectedAvatarPath(avatar.path)}
              className={`relative border-[3px] transition-all hover:rotate-1 ${
                selected
                  ? "border-[#ffcc00] ring-3 ring-[#ffcc00]/70 scale-[1.03]"
                  : "border-[#121212] hover:border-[#ffcc00] hover:scale-[1.02]"
              }`}
              style={{
                boxShadow: selected
                  ? "6px 6px 0px 0px rgba(255,204,0,0.8)"
                  : "4px 4px 0px 0px rgba(18,18,18,1)",
                transition: "transform 0.2s ease",
              }}
              aria-label={`Choose ${avatar.id}`}
            >
              <img
                src={avatar.url}
                alt={avatar.id}
                className="w-full aspect-[3/4] object-cover bg-[#101010]"
                loading="lazy"
              />
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-red-600 text-sm font-bold uppercase text-center mb-4">{error}</p>
      )}

      <div className="text-center">
        <button
          type="button"
          onClick={handleContinue}
          disabled={submitting}
          className="tcg-button-primary px-10 py-4 text-xl uppercase disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Saving avatar..." : "Continue"}
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Deck Selection ────────────────────────────────────────

interface DeckSelectionStepProps {
  decks: StarterDeck[] | undefined;
  selectDeckMutation: (args: { deckCode: string }) => Promise<{ deckId: string; cardCount: number }>;
  onComplete: () => void;
}

function DeckSelectionStep({
  decks,
  selectDeckMutation,
  onComplete,
}: DeckSelectionStepProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!selected) return;

    setSubmitting(true);
    setError("");

    try {
      await selectDeckMutation({ deckCode: selected });
      onComplete();
    } catch (err: any) {
      Sentry.captureException(err);
      setError(err.message ?? "Failed to select deck.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!decks) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-4 border-[#ffcc00] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div>
      <motion.div
        className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
      >
        {decks.map((deck) => {
          const color = ARCHETYPE_COLORS[deck.archetype] ?? "#666";
          const emoji = ARCHETYPE_EMOJI[deck.archetype] ?? "\u{1F0CF}";
          const isSelected = selected === deck.deckCode;

          return (
            <motion.button
              key={deck.deckCode}
              type="button"
              onClick={() => setSelected(deck.deckCode)}
              variants={{
                hidden: { opacity: 0, y: 16, scale: 0.95 },
                visible: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { type: "spring", stiffness: 300, damping: 24 },
                },
              }}
              whileHover={{ y: -4, boxShadow: "8px 8px 0px 0px rgba(18,18,18,1)" }}
              className={`
                paper-panel p-5 text-left cursor-pointer
                ${isSelected ? "ring-4 ring-[#ffcc00] -translate-y-1" : ""}
              `}
              style={{
                borderColor: isSelected ? color : "#121212",
                boxShadow: isSelected
                  ? `6px 6px 0px 0px ${color}`
                  : "4px 4px 0px 0px rgba(18,18,18,1)",
              }}
            >
              <div className="text-3xl mb-2">{emoji}</div>
              <h3
                className="text-lg leading-tight mb-1"
                style={{
                  fontFamily: "Outfit, sans-serif",
                  fontWeight: 900,
                  color,
                }}
              >
                {deck.name}
              </h3>
              <p
                className="text-xs text-[#666] mb-2 uppercase tracking-wide"
                style={{ fontFamily: "Special Elite, cursive" }}
              >
                {deck.playstyle}
              </p>
              <p className="text-xs text-[#444] leading-snug">{deck.description}</p>
              <p className="text-[10px] text-[#999] mt-2 uppercase">{deck.cardCount} cards</p>
            </motion.button>
          );
        })}
      </motion.div>

      {error && (
        <p className="text-red-600 text-sm font-bold uppercase text-center mb-4">{error}</p>
      )}

      <div className="text-center">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selected || submitting}
          className="tcg-button-primary px-10 py-4 text-xl uppercase disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Building deck..." : "Choose This Deck"}
        </button>
        <p
          className="text-xs text-[#666] uppercase tracking-wide mt-3"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          Clique assignment happens automatically from this starter deck.
        </p>
      </div>
    </div>
  );
}
