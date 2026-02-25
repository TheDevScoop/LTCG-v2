import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "@/router/react-router";
import { useConvexAuth } from "convex/react";
import * as Sentry from "@sentry/react";
import { apiAny, useConvexQuery, useConvexMutation } from "@/lib/convexHelpers";

type CardDef = {
  _id: string;
  name: string;
  cardType: string;
  archetype?: string;
  attack?: number;
  defense?: number;
  description?: string;
  rarity?: string;
  isActive?: boolean;
};

type DeckCard = { cardDefinitionId: string; quantity: number };
type UserCardCount = { cardDefinitionId: string; quantity: number };

const MAX_COPIES = 3;
const MIN_DECK_SIZE = 30;
const MAX_DECK_SIZE = 40;

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

export function DeckBuilder() {
  const { deckId: rawDeckId } = useParams<{ deckId: string }>();
  const deckId = normalizeDeckId(rawDeckId);
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();

  // Data
  const deckData = useConvexQuery(
    apiAny.game.getDeckWithCards,
    deckId ? { deckId } : "skip",
  ) as { name?: string; deckArchetype?: string; cards?: DeckCard[] } | null | undefined;

  const userCards = useConvexQuery(
    apiAny.game.getUserCardCounts,
    isAuthenticated ? {} : "skip",
  ) as UserCardCount[] | undefined;

  const allCards = useConvexQuery(apiAny.game.getCatalogCards, {}) as CardDef[] | undefined;

  const saveDeck = useConvexMutation(apiAny.game.saveDeck);

  // Local deck state — initialized from server data
  const [localCards, setLocalCards] = useState<Map<string, number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState("");
  const initializedDeckIdRef = useRef<string | null>(null);

  useEffect(() => {
    initializedDeckIdRef.current = null;
    setLocalCards(null);
    setSaved(false);
  }, [deckId]);

  useEffect(() => {
    if (!deckId || !deckData?.cards) return;
    if (initializedDeckIdRef.current === deckId) return;

    const map = new Map<string, number>();
    for (const c of deckData.cards) {
      map.set(c.cardDefinitionId, c.quantity);
    }
    setLocalCards(map);
    initializedDeckIdRef.current = deckId;
  }, [deckData?.cards, deckId]);

  const cards = localCards ?? new Map<string, number>();

  // Owned card IDs with quantities
  const ownedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const uc of userCards ?? []) {
      const existing = m.get(uc.cardDefinitionId) ?? 0;
      m.set(uc.cardDefinitionId, existing + (uc.quantity ?? 1));
    }
    return m;
  }, [userCards]);

  // Card lookup
  const cardLookup = useMemo(() => {
    const m = new Map<string, CardDef>();
    for (const c of allCards ?? []) {
      m.set(c._id, c);
    }
    return m;
  }, [allCards]);

  // Available cards = owned, filtered
  const available = useMemo(() => {
    const result: CardDef[] = [];
    for (const [defId] of ownedMap) {
      const def = cardLookup.get(defId);
      if (!def || !def.isActive) continue;
      if (filter && !def.name.toLowerCase().includes(filter.toLowerCase())) continue;
      result.push(def);
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [ownedMap, cardLookup, filter]);

  const deckTotal = useMemo(() => {
    let total = 0;
    for (const qty of cards.values()) total += qty;
    return total;
  }, [cards]);

  const addCard = useCallback(
    (defId: string) => {
      const current = cards.get(defId) ?? 0;
      const owned = ownedMap.get(defId) ?? 0;
      if (current >= MAX_COPIES || current >= owned || deckTotal >= MAX_DECK_SIZE) return;
      const next = new Map(cards);
      next.set(defId, current + 1);
      setLocalCards(next);
      setSaved(false);
    },
    [cards, ownedMap, deckTotal],
  );

  const removeCard = useCallback(
    (defId: string) => {
      const current = cards.get(defId) ?? 0;
      if (current <= 0) return;
      const next = new Map(cards);
      if (current === 1) next.delete(defId);
      else next.set(defId, current - 1);
      setLocalCards(next);
      setSaved(false);
    },
    [cards],
  );

  const handleSave = async () => {
    if (!deckId) return;
    setSaving(true);
    try {
      const deckCards: DeckCard[] = [];
      for (const [cardDefinitionId, quantity] of cards) {
        deckCards.push({ cardDefinitionId, quantity });
      }
      await saveDeck({ deckId, cards: deckCards });
      setSaved(true);
    } catch (err) {
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  };

  // Loading / invalid id handling
  if (!deckId) {
    return (
      <div className="min-h-screen flex flex-col gap-3 items-center justify-center bg-[#fdfdfb]">
        <p className="text-[#666] font-bold uppercase text-sm">Invalid deck id.</p>
        <button
          type="button"
          onClick={() => navigate("/decks")}
          className="tcg-button px-4 py-2 text-xs"
        >
          Back to Decks
        </button>
      </div>
    );
  }
  if (deckData === undefined || allCards === undefined || userCards === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
        <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (deckData === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
        <p className="text-[#666] font-bold uppercase text-sm">Deck not found.</p>
      </div>
    );
  }

  // Deck card list (sorted)
  const deckEntries = [...cards.entries()]
    .map(([defId, qty]) => ({ def: cardLookup.get(defId), defId, qty }))
    .filter((e) => e.def)
    .sort((a, b) => a.def!.name.localeCompare(b.def!.name));

  const isValid = deckTotal >= MIN_DECK_SIZE && deckTotal <= MAX_DECK_SIZE;

  return (
    <div className="min-h-screen bg-[#fdfdfb] flex flex-col md:flex-row">
      {/* Left: inventory */}
      <div className="flex-1 border-r-0 md:border-r-2 border-b-2 md:border-b-0 border-[#121212] flex flex-col">
        <header className="border-b-2 border-[#121212] px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate("/decks")}
              className="text-xs font-bold uppercase tracking-wider text-[#666] hover:text-[#121212] transition-colors mb-1 block"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              &larr; Decks
            </button>
            <h1
              className="text-lg"
              style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
            >
              YOUR CARDS
            </h1>
          </div>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search..."
            className="px-2 py-1 border-2 border-[#121212] bg-white text-xs font-bold w-32 focus:outline-none focus:ring-2 focus:ring-[#ffcc00]"
            style={{ fontFamily: "Outfit, sans-serif" }}
          />
        </header>

        <div className="flex-1 overflow-y-auto p-3 tcg-scrollbar">
          {available.length === 0 ? (
            <p className="text-center text-[#999] text-xs py-8 uppercase">No cards match</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {available.map((card) => {
                const inDeck = cards.get(card._id) ?? 0;
                const owned = ownedMap.get(card._id) ?? 0;
                const color = ARCHETYPE_COLORS[card.archetype ?? ""] ?? "#666";

                return (
                  <button
                    key={card._id}
                    type="button"
                    onClick={() => addCard(card._id)}
                    disabled={inDeck >= MAX_COPIES || inDeck >= owned || deckTotal >= MAX_DECK_SIZE}
                    className="paper-panel p-2.5 text-left text-xs transition-all hover:-translate-y-0.5 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <p
                      className="font-bold leading-tight line-clamp-2 mb-0.5"
                      style={{ fontFamily: "Outfit, sans-serif" }}
                    >
                      {card.name}
                    </p>
                    <p
                      className="text-[9px] uppercase tracking-wider"
                      style={{ color }}
                    >
                      {card.cardType}
                    </p>
                    {card.cardType === "stereotype" && (
                      <p className="text-[9px] text-[#999]">
                        {card.attack}/{card.defense}
                      </p>
                    )}
                    <p className="text-[9px] text-[#999] mt-0.5">
                      {inDeck}/{owned} in deck
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: deck contents */}
      <div className="w-full md:w-80 lg:w-96 flex flex-col bg-white">
        <header className="border-b-2 border-[#121212] px-4 py-3">
          <h2
            className="text-lg leading-tight"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
          >
            {deckData.name ?? "Deck"}
          </h2>
          <p
            className={`text-xs font-bold uppercase tracking-wider mt-1 ${
              isValid ? "text-[#38a169]" : "text-[#e53e3e]"
            }`}
          >
            {deckTotal} / {MIN_DECK_SIZE}-{MAX_DECK_SIZE} cards
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-3 tcg-scrollbar">
          {deckEntries.length === 0 ? (
            <p className="text-center text-[#999] text-xs py-8 uppercase">
              Tap cards on the left to add them
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {deckEntries.map(({ def, defId, qty }) => {
                const color = ARCHETYPE_COLORS[def!.archetype ?? ""] ?? "#666";
                return (
                  <div
                    key={defId}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-[#121212]/10"
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-bold leading-tight truncate"
                        style={{ fontFamily: "Outfit, sans-serif" }}
                      >
                        {def!.name}
                      </p>
                      <p className="text-[9px] uppercase" style={{ color }}>
                        {def!.cardType}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => removeCard(defId)}
                        className="w-6 h-6 flex items-center justify-center border-2 border-[#121212] text-xs font-bold hover:bg-[#e53e3e] hover:text-white hover:border-[#e53e3e] transition-colors"
                      >
                        -
                      </button>
                      <span className="text-xs font-bold w-4 text-center">{qty}</span>
                      <button
                        type="button"
                        onClick={() => addCard(defId)}
                        className="w-6 h-6 flex items-center justify-center border-2 border-[#121212] text-xs font-bold hover:bg-[#38a169] hover:text-white hover:border-[#38a169] transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="border-t-2 border-[#121212] px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isValid}
            className="tcg-button-primary flex-1 py-2.5 text-sm disabled:opacity-40"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Deck"}
          </button>
        </footer>
      </div>
    </div>
  );
}
