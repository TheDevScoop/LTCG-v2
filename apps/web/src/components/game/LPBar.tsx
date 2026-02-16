import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface LPBarProps {
  lp: number;
  maxLp: number;
  label: string;
  side: "player" | "opponent";
}

export function LPBar({ lp, maxLp, label, side }: LPBarProps) {
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const [prevLp, setPrevLp] = useState(lp);

  useEffect(() => {
    if (lp < prevLp) {
      setFlashColor("rgba(255, 0, 0, 0.3)");
      setTimeout(() => setFlashColor(null), 300);
    } else if (lp > prevLp) {
      setFlashColor("rgba(0, 255, 0, 0.3)");
      setTimeout(() => setFlashColor(null), 300);
    }
    setPrevLp(lp);
  }, [lp, prevLp]);

  const percentage = Math.max(0, Math.min(100, (lp / maxLp) * 100));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-['Outfit'] font-black uppercase tracking-tighter text-sm">
          {label}
        </span>
        <span className="font-['Outfit'] font-black text-2xl">
          {lp}
        </span>
      </div>
      <div
        className="relative h-8 border-2 border-[#121212] bg-[#fdfdfb] overflow-hidden"
        style={{
          backgroundColor: flashColor || "#fdfdfb",
          transition: "background-color 0.3s ease",
        }}
      >
        <motion.div
          className={`h-full ${
            side === "player" ? "bg-[#fdfdfb]" : "bg-[#121212]"
          }`}
          style={{
            borderRight: side === "player" ? "2px solid #121212" : "none",
          }}
          initial={{ width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
