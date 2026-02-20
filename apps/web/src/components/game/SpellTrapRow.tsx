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
  onSlotClick?: (cardId: string) => void;
}

const CARD_BACK_IMG = CARD_BACK;

export function SpellTrapRow({
  cards,
  cardLookup,
  maxSlots = 3,
  fieldSpell,
  interactive = false,
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

          return (
            <motion.div
              key={`${st.cardId}-${st.faceDown ? "fd" : "fu"}`}
              className={`st-slot ${st.faceDown ? "st-slot-set" : "st-slot-active"} ${isClickable ? "cursor-pointer" : ""}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={isClickable ? () => onSlotClick!(st.cardId) : undefined}
              title={st.faceDown ? "Set Card" : (def?.name ?? "S/T")}
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
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
