import { motion, AnimatePresence, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface LPBarProps {
  lp: number;
  maxLp: number;
  label: string;
  side: "player" | "opponent";
  platformTag?: string | null;
}

export function LPBar({ lp, maxLp, label, side, platformTag }: LPBarProps) {
  const prevLpRef = useRef(lp);
  const [delta, setDelta] = useState<number | null>(null);
  const [damageFlash, setDamageFlash] = useState(false);

  // Animated LP counter that counts up/down smoothly
  const springLp = useSpring(lp, { stiffness: 60, damping: 20 });
  const displayLp = useTransform(springLp, (v) => Math.round(v));
  const [renderedLp, setRenderedLp] = useState(lp);

  useEffect(() => {
    springLp.set(lp);
  }, [lp, springLp]);

  useEffect(() => {
    const unsub = displayLp.on("change", (v) => setRenderedLp(v));
    return unsub;
  }, [displayLp]);

  // Detect damage/heal and show delta pop + damage flash
  useEffect(() => {
    const diff = lp - prevLpRef.current;
    if (diff !== 0) {
      setDelta(diff);
      if (diff < 0) {
        setDamageFlash(true);
        setTimeout(() => setDamageFlash(false), 500);
      }
      const t = setTimeout(() => setDelta(null), 1200);
      prevLpRef.current = lp;
      return () => clearTimeout(t);
    }
  }, [lp]);

  const percentage = Math.max(0, Math.min(100, (lp / maxLp) * 100));
  const isLow = percentage <= 25;
  const barColor = side === "player"
    ? (isLow ? "#ef4444" : "#e8e4df")
    : (isLow ? "#ef4444" : "#4a4a4a");

  return (
    <div className={`flex items-center gap-3 ${damageFlash ? "animate-damage-shake" : ""}`}>
      {/* Label */}
      <div className="flex flex-col items-start min-w-0 flex-shrink-0">
        <span className="font-['Outfit'] font-black uppercase tracking-tighter text-[10px] text-white/50 leading-none flex items-center gap-1.5">
          {label}
          {platformTag ? (
            <span className="text-[8px] px-1 py-0.5 border border-white/20 bg-white/10 text-white/60 leading-none">
              {platformTag}
            </span>
          ) : null}
        </span>
      </div>

      {/* HP Bar */}
      <div className={`relative flex-1 h-7 border-2 border-white/20 bg-[#1a1816] overflow-hidden ${damageFlash ? "lp-damage-flash" : ""}`}>
        <motion.div
          className="h-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        {/* Ink hatching overlay on low HP */}
        {isLow && (
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: "repeating-linear-gradient(45deg, #121212 0px, #121212 1px, transparent 1px, transparent 4px)",
            }}
          />
        )}
      </div>

      {/* LP Number — bigger comic style */}
      <div className="relative flex-shrink-0 min-w-[72px] text-right">
        <motion.span
          className={`font-['Special_Elite'] font-black text-2xl leading-none tabular-nums ${
            isLow ? "text-[#ef4444]" : side === "player" ? "text-white/90" : "text-white/90"
          }`}
          animate={delta !== null ? {
            scale: [1, delta < 0 ? 1.3 : 1.15, 1],
            rotate: delta < 0 ? [0, -2, 2, 0] : [0, 0],
          } : {}}
          transition={{ duration: 0.3 }}
        >
          {renderedLp}
        </motion.span>

        {/* Delta pop — bigger damage/heal indicator */}
        <AnimatePresence>
          {delta !== null && (
            <motion.div
              key={delta + Date.now()}
              initial={{ opacity: 1, y: 0, scale: 1.4 }}
              animate={{ opacity: 0, y: delta < 0 ? 24 : -24, scale: 0.8 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className={`absolute -top-2 right-0 font-['Special_Elite'] font-black text-2xl pointer-events-none whitespace-nowrap ${
                delta < 0 ? "text-[#ef4444]" : "text-[#22c55e]"
              }`}
              style={{
                textShadow: "3px 3px 0 rgba(0,0,0,0.8)",
              }}
            >
              {delta > 0 ? `+${delta}` : delta}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
