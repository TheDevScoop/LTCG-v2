import type { ReactNode } from "react";
import { motion } from "framer-motion";

export interface GameOverOverlayProps {
  result: "win" | "loss" | "draw";
  playerLP: number;
  opponentLP: number;
  onRematch?: () => void;
  onExit: () => void;
  /** Optional children rendered below the buttons (e.g., RematchOverlay). */
  children?: ReactNode;
}

export function GameOverOverlay({
  result,
  playerLP,
  opponentLP,
  onRematch,
  onExit,
  children,
}: GameOverOverlayProps) {
  // Determine result styling
  const resultConfig = {
    win: {
      title: "VICTORY",
      color: "#ffcc00",
      accentBg: "bg-yellow-50",
      message: "You proved your worth at the table.",
      stamp: "CLEARED",
    },
    loss: {
      title: "DEFEAT",
      color: "#e53e3e",
      accentBg: "bg-red-50",
      message: "The hallway isn't done with you yet.",
      stamp: "GAME OVER",
    },
    draw: {
      title: "DRAW",
      color: "#999999",
      accentBg: "bg-gray-50",
      message: "Neither player could achieve victory.",
      stamp: "STALEMATE",
    },
  };

  const config = resultConfig[result];

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Stamp overlay (rotated) */}
      <motion.div
        className="fixed inset-0 pointer-events-none flex items-center justify-center"
        initial={{ opacity: 0, rotate: -15, scale: 0.5 }}
        animate={{ opacity: 0.15, rotate: -15, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div
          className="text-9xl font-black uppercase tracking-tighter"
          style={{ fontFamily: "Outfit, sans-serif", color: "#121212" }}
        >
          {config.stamp}
        </div>
      </motion.div>

      {/* Main panel */}
      <motion.div
        className={`paper-panel max-w-md w-full mx-4 p-12 text-center relative z-10 border-2 border-[#121212] ${config.accentBg}`}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{
          duration: 0.4,
          type: "spring",
          stiffness: 120,
          damping: 12,
        }}
      >
        {/* Result title */}
        <motion.h1
          className="text-5xl font-black uppercase tracking-tighter mb-4"
          style={{
            fontFamily: "Outfit, sans-serif",
            color: config.color,
          }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          {config.title}
        </motion.h1>

        {/* Message */}
        <motion.p
          className="text-sm text-[#666] mb-8"
          style={{ fontFamily: "Special Elite, cursive" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          {config.message}
        </motion.p>

        {/* LP Display */}
        <motion.div
          className="grid grid-cols-2 gap-6 mb-10 p-6 border-2 border-[#121212]/30 bg-white/60"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          <div>
            <p
              className="text-[10px] text-[#999] uppercase tracking-wider mb-2"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              Your LP
            </p>
            <p
              className="text-3xl font-black"
              style={{ fontFamily: "Outfit, sans-serif", color: config.color }}
            >
              {playerLP}
            </p>
          </div>
          <div>
            <p
              className="text-[10px] text-[#999] uppercase tracking-wider mb-2"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              Opponent LP
            </p>
            <p
              className="text-3xl font-black text-[#666]"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              {opponentLP}
            </p>
          </div>
        </motion.div>

        {/* Button Container */}
        <motion.div
          className="flex gap-3 justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          {onRematch && (
            <button
              type="button"
              onClick={onRematch}
              className="tcg-button px-8 py-3 text-sm font-bold uppercase tracking-wider hover:shadow-zine"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Play Again
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            className="tcg-button-primary px-8 py-3 text-sm font-bold uppercase tracking-wider hover:shadow-zine"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Exit
          </button>
        </motion.div>

        {/* Children (e.g., RematchOverlay) */}
        {children}
      </motion.div>
    </motion.div>
  );
}
