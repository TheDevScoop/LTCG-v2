import { useState } from "react";
import { useNavigate } from "@/router/react-router";
import { useConvexAuth } from "convex/react";
import * as Sentry from "@sentry/react";
import { motion } from "framer-motion";
import { apiAny, useConvexQuery, useConvexMutation } from "@/lib/convexHelpers";
import { SkeletonRow } from "@/components/ui/Skeleton";

type Deck = {
  _id: string;
  deckId: string;
  name: string;
  deckArchetype?: string;
  cards?: { cardDefinitionId: string; quantity: number }[];
};

const ARCHETYPE_COLORS: Record<string, string> = {
  dropouts: "#e53e3e",
  preps: "#3182ce",
  geeks: "#d69e2e",
  freaks: "#805ad5",
  nerds: "#38a169",
  goodies: "#a0aec0",
};

const RESERVED_DECK_IDS = new Set(["undefined", "null", "skip"]);
const normalizeDeckId = (deckId: string | undefined): string | null => {
  if (!deckId) return null;
  const trimmed = deckId.trim();
  if (!trimmed) return null;
  if (RESERVED_DECK_IDS.has(trimmed.toLowerCase())) return null;
  return trimmed;
};

export function Decks() {
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();
  const userDecks = useConvexQuery(
    apiAny.game.getUserDecks,
    isAuthenticated ? {} : "skip",
  ) as Deck[] | undefined;

  const currentUser = useConvexQuery(
    apiAny.auth.currentUser,
    isAuthenticated ? {} : "skip",
  ) as { activeDeckId?: string } | null | undefined;
  const hasActiveDeck = normalizeDeckId(currentUser?.activeDeckId) !== null;
  const hasAnyDeck = (userDecks?.length ?? 0) > 0;
  const canCreateDeck = hasAnyDeck || hasActiveDeck;

  const setActiveDeck = useConvexMutation(apiAny.game.setActiveDeck);
  const createDeck = useConvexMutation(apiAny.game.createDeck);
  const [settingActive, setSettingActive] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState("");

  const handleSetActive = async (deckId: string) => {
    setSettingActive(deckId);
    try {
      await setActiveDeck({ deckId });
    } catch (err) {
      Sentry.captureException(err);
    } finally {
      setSettingActive(null);
    }
  };

  const handleCreateDeck = async () => {
    if (!canCreateDeck) {
      setCreationError("Create a starter deck before making additional decks.");
      return;
    }
    setCreating(true);
    setCreationError("");
    try {
      const result = await createDeck({ name: `Deck ${(userDecks?.length ?? 0) + 1}` });
      const createdDeckId = normalizeDeckId(
        typeof result === "string" ? result : result?.deckId,
      );
      if (!createdDeckId) {
        throw new Error("Deck creation did not return a valid deck id.");
      }
      navigate(`/decks/${createdDeckId}`);
    } catch (err) {
      Sentry.captureException(err);
      const message =
        err instanceof Error ? err.message : "Failed to create deck.";
      setCreationError(message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fdfdfb]" style={{ paddingBottom: "var(--safe-area-bottom)" }}>
      {/* Header */}
      <header className="border-b-2 border-[#121212] px-6 py-5 flex items-center justify-between">
        <div>
          <motion.h1
            className="text-4xl tracking-tighter"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            DECKS
          </motion.h1>
          <motion.p
            className="text-sm text-[#666] mt-1"
            style={{ fontFamily: "Special Elite, cursive" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            Stack your hand before the bell rings
          </motion.p>
        </div>
        <button
          type="button"
          onClick={handleCreateDeck}
          disabled={creating || !canCreateDeck}
          className="tcg-button-primary px-5 py-2.5 text-sm disabled:opacity-50"
        >
          {creating ? "Creating..." : canCreateDeck ? "+ New Deck" : "Create Starter Deck First"}
        </button>
      </header>

      {!canCreateDeck ? (
        <div className="max-w-3xl mx-auto px-6 pt-4">
          <p className="text-sm font-bold uppercase text-[#666]">
            Pick a starter deck before creating a custom deck.
          </p>
        </div>
      ) : null}

      {creationError ? (
        <div className="max-w-3xl mx-auto px-6 pt-4">
          <p className="text-red-600 text-sm font-bold uppercase">{creationError}</p>
        </div>
      ) : null}

      {/* Deck list */}
      <div className="p-6 max-w-3xl mx-auto">
        {!userDecks ? (
          <div className="flex flex-col gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ animationDelay: `${i * 0.15}s` }}>
                <SkeletonRow height={96} />
              </div>
            ))}
          </div>
        ) : userDecks.length === 0 ? (
          <div className="paper-panel p-12 text-center">
            <p className="text-[#666] font-bold uppercase text-sm">
              No decks yet.
            </p>
            <p
              className="text-xs text-[#999] mt-2"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              Select a starter deck from onboarding to get started.
            </p>
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-4"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.1 } },
            }}
          >
            {userDecks.map((deck) => {
              const isActive = currentUser?.activeDeckId === deck.deckId;
              const color = ARCHETYPE_COLORS[deck.deckArchetype ?? ""] ?? "#121212";
              const cardCount = (deck.cards ?? []).reduce(
                (sum, c) => sum + c.quantity,
                0,
              );

              return (
                <motion.div
                  key={deck._id}
                  className={`paper-panel p-6 transition-all ${isActive ? "ring-2 ring-[#ffcc00] shadow-[6px_6px_0px_0px_rgba(18,18,18,1)] animate-waiting-glow" : ""}`}
                  variants={{
                    hidden: { opacity: 0, x: -20 },
                    visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
                  }}
                  whileHover={{ y: -3, boxShadow: "6px 6px 0px 0px rgba(18,18,18,1)" }}
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="w-full md:w-auto">
                      <div className="flex items-center gap-2 mb-1">
                        <h2
                          className="text-xl leading-tight"
                          style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
                        >
                          {deck.name}
                        </h2>
                        {isActive && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#ffcc00] bg-[#121212] px-1.5 py-0.5">
                            Active
                          </span>
                        )}
                      </div>
                      {deck.deckArchetype && (
                        <p
                          className="text-xs uppercase tracking-wider"
                          style={{ fontFamily: "Special Elite, cursive", color }}
                        >
                          {deck.deckArchetype}
                        </p>
                      )}
                      <p className="text-xs text-[#999] mt-1">
                        {cardCount} cards
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full md:w-auto mt-2 md:mt-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/decks/${deck.deckId}`)}
                        className="tcg-button px-4 py-2 text-xs"
                      >
                        Edit
                      </button>
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => handleSetActive(deck.deckId)}
                          disabled={settingActive === deck.deckId}
                          className="tcg-button px-4 py-2 text-xs disabled:opacity-50"
                        >
                          {settingActive === deck.deckId ? "Setting..." : "Set Active"}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
