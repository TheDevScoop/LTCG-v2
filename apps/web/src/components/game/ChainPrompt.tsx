import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ChainPromptProps {
  opponentCardName: string;
  activatableTraps: Array<{ cardId: string; name: string }>;
  onActivate: (cardId: string) => void;
  onPass: () => void;
}

export function ChainPrompt({
  opponentCardName,
  activatableTraps,
  onActivate,
  onPass,
}: ChainPromptProps) {
  const [timeLeft, setTimeLeft] = useState(5);
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

  // Timer bar width percentage
  const timerWidth = `${(timeLeft / 5) * 100}%`;

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
          className="relative w-full paper-panel max-h-[70vh] overflow-y-auto tcg-scrollbar"
        >
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <h2 className="font-outfit font-black text-2xl uppercase tracking-tighter">
                OPPONENT ACTIVATED
              </h2>
              <h3 className="font-outfit font-black text-xl uppercase tracking-tighter text-[#ffcc00]">
                {opponentCardName}
              </h3>
              <p
                className="font-zine text-lg text-foreground/80 italic"
                style={{ fontFamily: "Special Elite, cursive" }}
              >
                Respond?
              </p>
            </div>

            {/* Activatable Traps List */}
            {activatableTraps.length > 0 ? (
              <div className="space-y-2">
                {activatableTraps.map((trap) => (
                  <button
                    key={trap.cardId}
                    onClick={() => handleActivate(trap.cardId)}
                    className="w-full tcg-button text-sm"
                  >
                    ACTIVATE: {trap.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="font-outfit font-bold text-foreground/60">
                  No traps available
                </p>
              </div>
            )}

            {/* Timer Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-outfit font-bold text-xs uppercase tracking-wider">
                  Auto-pass in
                </p>
                <span className="font-mono font-black text-lg text-[#ffcc00]">
                  {timeLeft}s
                </span>
              </div>
              <div className="relative h-2 bg-foreground/10 border-2 border-foreground overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-[#ffcc00]"
                  initial={{ width: "100%" }}
                  animate={{ width: timerWidth }}
                  transition={{ duration: 0.1, ease: "linear" }}
                />
              </div>
            </div>

            {/* Pass Button */}
            <button onClick={handlePass} className="w-full tcg-button-primary text-sm">
              PASS
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
