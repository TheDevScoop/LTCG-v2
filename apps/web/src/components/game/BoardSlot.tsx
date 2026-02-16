import { motion } from "framer-motion";
import type { BoardCard } from "@lunchtable-tcg/engine";

interface BoardSlotProps {
  card?: BoardCard;
  cardDef?: any;
  highlight?: boolean;
  onClick?: () => void;
}

export function BoardSlot({ card, cardDef, highlight, onClick }: BoardSlotProps) {
  const isClickable = !!onClick;

  // Empty slot
  if (!card) {
    return (
      <motion.div
        className={`aspect-[3/4] w-20 border-2 border-dashed border-[#121212] flex items-center justify-center ${
          isClickable ? "cursor-pointer" : ""
        }`}
        whileHover={isClickable ? { scale: 1.05 } : {}}
        whileTap={isClickable ? { scale: 0.95 } : {}}
        onClick={onClick}
      >
        <span className="text-[#121212] text-2xl opacity-30">+</span>
      </motion.div>
    );
  }

  // Face-down card
  if (card.faceDown) {
    return (
      <motion.div
        className={`aspect-[3/4] w-20 bg-[#121212] border-2 border-[#121212] flex items-center justify-center ${
          highlight ? "ring-2 ring-[#ffcc00] animate-pulse" : ""
        } ${isClickable ? "cursor-pointer" : ""}`}
        whileHover={isClickable ? { scale: 1.05 } : {}}
        whileTap={isClickable ? { scale: 0.95 } : {}}
        onClick={onClick}
      >
        <span className="font-['Special_Elite'] text-4xl text-[#fdfdfb]">?</span>
      </motion.div>
    );
  }

  // Face-up card
  const isMonster = cardDef?.type === "stereotype";
  const positionIcon = card.position === "attack" ? "⚔️" : "🛡️";

  return (
    <motion.div
      className={`aspect-[3/4] w-20 paper-panel border-2 border-[#121212] p-1 flex flex-col relative ${
        highlight ? "ring-2 ring-[#ffcc00] animate-pulse" : ""
      } ${isClickable ? "cursor-pointer" : ""}`}
      whileHover={isClickable ? { scale: 1.05 } : {}}
      whileTap={isClickable ? { scale: 0.95 } : {}}
      onClick={onClick}
    >
      {/* Card name */}
      <div className="font-['Outfit'] font-bold text-[8px] leading-tight truncate">
        {cardDef?.name || "Unknown"}
      </div>

      {/* Vice counter badge */}
      {card.viceCounters > 0 && (
        <div className="absolute top-0 right-0 bg-red-600 text-white text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center">
          {card.viceCounters}
        </div>
      )}

      {/* Position indicator */}
      <div className="absolute top-1 left-1 text-sm">
        {positionIcon}
      </div>

      {/* Stats at bottom */}
      {isMonster && (
        <div className="mt-auto flex justify-between text-[8px] font-bold">
          <span className="text-[#ffcc00]">
            ATK {cardDef?.attack ?? 0}
          </span>
          <span className="text-[#33ccff]">
            DEF {cardDef?.defense ?? 0}
          </span>
        </div>
      )}
    </motion.div>
  );
}
