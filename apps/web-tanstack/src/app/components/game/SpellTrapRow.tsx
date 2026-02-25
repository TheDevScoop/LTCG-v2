import { motion, AnimatePresence } from "framer-motion";
import { CARD_BACK } from "@/lib/blobUrls";

interface SpellTrapCard {
  cardId: string;
  definitionId: string;
  faceDown?: boolean;
  activated?: boolean;
}

interface FieldSpell {
  definitionId: string;
  cardId?: string;
}

interface SpellTrapRowProps {
  cards: SpellTrapCard[];
  cardLookup: Record<string, any>;
  maxSlots?: number;
  fieldSpell?: FieldSpell | null;
  interactive?: boolean;
  highlightIds?: Set<string>;
  onSlotClick?: (cardId: string) => void;
}

const CARD_BACK_IMG = CARD_BACK;

export function SpellTrapRow({
  cards,
  cardLookup,
  maxSlots = 3,
  fieldSpell,
  interactive = false,
  highlightIds,
  onSlotClick,
}: SpellTrapRowProps) {
  const slots = Array.from({ length: maxSlots });

  return (
    <div className="flex justify-center items-center gap-1.5" style={{ transformStyle: "preserve-3d" }}>
      {/* Field Spell (if any) */}
      {fieldSpell && (() => {
        const def = cardLookup[fieldSpell.definitionId];
        return (
          <div
            className="st-slot st-slot-active"
            title={def?.name ?? "Field Spell"}
          >
            <span className="st-slot-label">{(def?.name ?? "FIELD").slice(0, 6)}</span>
          </div>
        );
      })()}

      <AnimatePresence mode="popLayout">
        {slots.map((_, i) => {
          const st = cards[i];

          if (!st) {
            return (
              <div key={`st-empty-${i}`} className="st-slot st-slot-empty">
                <span className="text-white/10 font-['Special_Elite'] text-[9px]">S/T</span>
              </div>
            );
          }

          const def = cardLookup[st.definitionId];
          const isClickable = interactive && !!onSlotClick;
          const isHighlighted = highlightIds?.has(st.cardId);

          return (
            <motion.div
              key={`${st.cardId}-${st.faceDown ? "fd" : "fu"}`}
              className={`st-slot ${st.faceDown ? "st-slot-set" : "st-slot-active"} ${isClickable ? "cursor-pointer" : ""}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={isClickable ? () => onSlotClick!(st.cardId) : undefined}
              title={st.faceDown ? (isHighlighted ? "Activate this card" : "Set Card") : (def?.name ?? "S/T")}
              style={isHighlighted ? {
                boxShadow: "0 0 8px rgba(255,204,0,0.5), inset 0 0 4px rgba(255,204,0,0.2)",
                border: "1.5px solid #ffcc00",
              } : undefined}
            >
              {st.faceDown ? (
                <img
                  src={CARD_BACK_IMG}
                  alt="Set card"
                  className="absolute inset-0 w-full h-full object-cover opacity-60"
                  draggable={false}
                />
              ) : (
                <span className="st-slot-label">{(def?.name ?? "S/T").slice(0, 8)}</span>
              )}
              {/* Activatable pulse overlay */}
              {isHighlighted && st.faceDown && (
                <motion.div
                  className="absolute inset-0 pointer-events-none z-10"
                  animate={{ opacity: [0.2, 0.5, 0.2] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    border: "1.5px solid #ffcc00",
                    boxShadow: "inset 0 0 6px rgba(255,204,0,0.3)",
                  }}
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
