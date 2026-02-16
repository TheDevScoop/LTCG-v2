import { motion } from "framer-motion";
import { getArchetypeTheme } from "@/lib/archetypeThemes";

interface HandCardProps {
  cardId: string;
  cardDef?: any;
  index: number;
  totalCards: number;
  playable?: boolean;
  onClick?: () => void;
}

export function HandCard({
  cardDef,
  index,
  totalCards,
  playable,
  onClick,
}: HandCardProps) {
  const center = (totalCards - 1) / 2;
  const offset = index - center;
  const rotate = offset * 3;
  const translateY = Math.abs(offset) * 4;

  const typeIcon =
    cardDef?.type === "stereotype"
      ? "⚔️"
      : cardDef?.type === "spell"
      ? "🪄"
      : cardDef?.type === "trap"
      ? "🪤"
      : "❓";

  const archetypeTheme = getArchetypeTheme(cardDef?.archetype);
  // Map color name to hex for border
  const colorMap: Record<string, string> = {
    red: "#ef4444",
    blue: "#3b82f6",
    yellow: "#eab308",
    purple: "#a855f7",
    green: "#22c55e",
    gray: "#9ca3af",
  };
  const archetypeColor = colorMap[archetypeTheme.color] || "#121212";

  const isMonster = cardDef?.type === "stereotype";
  const isClickable = !!onClick;

  return (
    <motion.div
      className={`w-[60px] h-[84px] paper-panel border-2 border-[#121212] flex flex-col overflow-hidden ${
        playable ? "ring-2 ring-[#ffcc00] animate-pulse" : ""
      } ${isClickable ? "cursor-pointer" : ""}`}
      style={{
        rotate: `${rotate}deg`,
        y: translateY,
      }}
      whileHover={
        isClickable
          ? { y: -20, scale: 1.1, zIndex: 10, rotate: 0 }
          : {}
      }
      whileTap={isClickable ? { scale: 0.95 } : {}}
      onClick={onClick}
    >
      {/* Archetype color stripe */}
      <div
        className="h-1 w-full"
        style={{ backgroundColor: archetypeColor }}
      />

      {/* Card content */}
      <div className="flex-1 p-1 flex flex-col">
        {/* Type icon */}
        <div className="text-xs text-center">{typeIcon}</div>

        {/* Card name */}
        <div className="font-['Outfit'] font-bold text-[8px] leading-tight text-center truncate">
          {cardDef?.name || "Unknown"}
        </div>

        {/* Stats for monsters */}
        {isMonster && (
          <div className="mt-auto text-[6px] font-bold text-center">
            <div className="text-[#ffcc00]">ATK {cardDef?.attack ?? 0}</div>
            <div className="text-[#33ccff]">DEF {cardDef?.defense ?? 0}</div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
