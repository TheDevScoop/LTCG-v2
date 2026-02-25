import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChainLink } from "@/lib/convexTypes";

interface ChainPromptProps {
  opponentCardName: string;
  activatableTraps: Array<{ cardId: string; name: string }>;
  activatableQuickPlays?: Array<{ cardId: string; name: string }>;
  chainLinks?: ChainLink[];
  cardLookup?: Record<string, { name?: string }>;
  onActivate: (cardId: string) => void;
  onPass: () => void;
}

const TIMER_SECONDS = 10;

export function ChainPrompt({
  opponentCardName,
  activatableTraps,
  activatableQuickPlays = [],
  chainLinks = [],
  cardLookup = {},
  onActivate,
  onPass,
}: ChainPromptProps) {
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const passedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  const handlePass = useCallback(() => {
    if (passedRef.current) return;
    passedRef.current = true;
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTimeLeft(0);
    onPass();
  }, [onPass]);

  const handleActivate = useCallback(
    (cardId: string) => {
      if (passedRef.current) return;
      passedRef.current = true;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setTimeLeft(0);
      onActivate(cardId);
    },
    [onActivate],
  );

  useEffect(() => {
    passedRef.current = false;
    setTimeLeft(TIMER_SECONDS);
    intervalRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (passedRef.current) return 0;
        if (prev <= 1) {
          Promise.resolve().then(handlePass);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [handlePass]);

  const timerWidth = `${(timeLeft / TIMER_SECONDS) * 100}%`;
  const hasResponses = activatableTraps.length > 0 || activatableQuickPlays.length > 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-40 flex items-end">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50"
        />

        {/* Chain Prompt Panel */}
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full bg-black border-t-2 border-[#121212] max-h-[75vh] overflow-y-auto tcg-scrollbar"
        >
          <div className="p-5 space-y-4">
            {/* Header */}
            <div className="text-center space-y-1">
              <h2
                className="font-black text-xl uppercase tracking-tighter text-white"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                CHAIN RESPONSE
              </h2>
              <p
                className="text-sm text-[#ffcc00] italic"
                style={{ fontFamily: "Special Elite, cursive" }}
              >
                Opponent activated: {opponentCardName}
              </p>
            </div>

            {/* Chain Links Display */}
            {chainLinks.length > 0 && (
              <div className="space-y-1">
                <p
                  className="text-[9px] uppercase tracking-widest text-white/40 font-bold"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  Chain Stack ({chainLinks.length})
                </p>
                <div className="border-2 border-white/10 bg-white/5 p-2 space-y-1 max-h-28 overflow-y-auto tcg-scrollbar">
                  {chainLinks.map((link, i) => {
                    const name = cardLookup[link.cardId]?.name ?? "Unknown";
                    const isOpponent = link.activatingPlayer !== chainLinks[0]?.activatingPlayer;
                    return (
                      <div
                        key={`chain-${i}-${link.cardId}`}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          className="font-mono font-black text-[#ffcc00] w-5 text-center"
                          style={{ fontFamily: "Outfit, sans-serif" }}
                        >
                          {chainLinks.length - i}
                        </span>
                        <span
                          className={`font-bold uppercase tracking-tight ${
                            isOpponent ? "text-red-400" : "text-white"
                          }`}
                          style={{ fontFamily: "Outfit, sans-serif" }}
                        >
                          {name}
                        </span>
                        <span className="text-white/30 text-[10px]">
                          ({isOpponent ? "OPP" : "YOU"})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Activatable Cards */}
            {hasResponses ? (
              <div className="space-y-2">
                {/* Counter Traps */}
                {activatableTraps.map((trap) => (
                  <button
                    key={trap.cardId}
                    onClick={() => handleActivate(trap.cardId)}
                    className="w-full tcg-button text-sm"
                  >
                    ACTIVATE TRAP: {trap.name}
                  </button>
                ))}

                {/* Quick-Play Spells */}
                {activatableQuickPlays.map((spell) => (
                  <button
                    key={spell.cardId}
                    onClick={() => handleActivate(spell.cardId)}
                    className="w-full tcg-button text-sm"
                  >
                    ACTIVATE SPELL: {spell.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-3">
                <p
                  className="font-bold text-white/40 text-sm"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  No responses available
                </p>
              </div>
            )}

            {/* Timer Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p
                  className="font-bold text-[10px] uppercase tracking-wider text-white/50"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  Auto-pass in
                </p>
                <span className="font-mono font-black text-base text-[#ffcc00]">
                  {timeLeft}s
                </span>
              </div>
              <div className="relative h-1.5 bg-white/10 border border-white/20 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-[#ffcc00]"
                  initial={{ width: "100%" }}
                  animate={{ width: timerWidth }}
                  transition={{ duration: 0.3, ease: "linear" }}
                />
              </div>
            </div>

            {/* Pass Button */}
            <button
              onClick={handlePass}
              className="w-full bg-white/10 border-2 border-white/20 text-white font-black uppercase tracking-wider text-sm py-3 hover:bg-white/20 transition-colors"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              PASS
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
