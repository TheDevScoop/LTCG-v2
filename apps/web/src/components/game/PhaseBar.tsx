import type { Phase } from "@lunchtable-tcg/engine";

interface PhaseBarProps {
  currentPhase: Phase;
  isMyTurn: boolean;
  onAdvance: () => void;
}

const PHASES: { phase: Phase; label: string }[] = [
  { phase: "draw", label: "DRAW" },
  { phase: "standby", label: "STBY" },
  { phase: "main", label: "MAIN" },
  { phase: "combat", label: "CMBT" },
  { phase: "main2", label: "MAIN2" },
  { phase: "breakdown_check", label: "BRKDN" },
  { phase: "end", label: "END" },
];

export function PhaseBar({ currentPhase, isMyTurn, onAdvance }: PhaseBarProps) {
  return (
    <div
      className={`flex border-2 border-[#121212] overflow-hidden ${
        isMyTurn ? "cursor-pointer" : "cursor-not-allowed"
      }`}
      onClick={isMyTurn ? onAdvance : undefined}
    >
      {PHASES.map(({ phase, label }) => {
        const isCurrent = phase === currentPhase;
        return (
          <div
            key={phase}
            className={`flex-1 py-2 px-1 text-center border-r-2 border-[#121212] last:border-r-0 transition-colors ${
              isCurrent
                ? "bg-[#ffcc00] text-[#121212]"
                : "bg-[#fdfdfb] text-[#121212]"
            }`}
          >
            <span className="font-['Outfit'] font-black uppercase tracking-tighter text-xs sm:text-sm">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
