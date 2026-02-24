import { motion } from "framer-motion";
import type { Phase } from "./types";

interface PhaseBarProps {
  currentPhase: Phase;
  isMyTurn: boolean;
  onAdvance: () => void;
}

// Only show phases the player actually interacts with.
// Draw, standby, breakdown_check, and end auto-advance.
const VISIBLE_PHASES: { phase: Phase; label: string }[] = [
  { phase: "main", label: "MAIN" },
  { phase: "combat", label: "BATTLE" },
  { phase: "main2", label: "MAIN 2" },
];

/** Map auto-advance phases to the nearest visible phase for highlighting. */
function resolveVisiblePhase(current: Phase): Phase {
  if (current === "draw" || current === "standby") return "main";
  if (current === "breakdown_check" || current === "end") return "main2";
  return current;
}

export function PhaseBar({ currentPhase, isMyTurn, onAdvance }: PhaseBarProps) {
  const highlight = resolveVisiblePhase(currentPhase);

  return (
    <div
      className={`flex border-2 border-[#2a2520] overflow-hidden ${
        isMyTurn ? "cursor-pointer" : "cursor-not-allowed"
      }`}
      style={{ background: "#1a1816" }}
      onClick={isMyTurn ? onAdvance : undefined}
    >
      {VISIBLE_PHASES.map(({ phase, label }) => {
        const isCurrent = phase === highlight;
        const isPast = VISIBLE_PHASES.findIndex((p) => p.phase === highlight) >
          VISIBLE_PHASES.findIndex((p) => p.phase === phase);
        return (
          <div
            key={phase}
            className="flex-1 py-2 px-1 text-center border-r border-white/8 last:border-r-0 relative"
          >
            {/* Sliding underline indicator */}
            {isCurrent && (
              <motion.div
                layoutId="phase-indicator"
                className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{
                  background: "#ffffff",
                  boxShadow: "0 0 6px rgba(255, 255, 255, 0.2)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span
              className={`relative z-10 font-['Outfit'] font-black uppercase tracking-tighter text-xs sm:text-sm ${
                isCurrent
                  ? "text-white"
                  : isPast
                    ? "text-white/20"
                    : "text-white/50"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
