import { AnimatePresence } from "framer-motion";
import type { BoardCard } from "./types";
import { BoardSlot } from "./BoardSlot";

interface FieldRowProps {
  cards: BoardCard[];
  cardLookup: Record<string, any>;
  maxSlots?: number;
  highlightIds?: Set<string>;
  onSlotClick?: (cardId: string) => void;
  reversed?: boolean;
}

export function FieldRow({
  cards,
  cardLookup,
  maxSlots = 5,
  highlightIds,
  onSlotClick,
  reversed = false,
}: FieldRowProps) {
  const slots = Array.from({ length: maxSlots });

  return (
    <div className="flex justify-center overflow-visible" style={{ gap: "clamp(6px, 1vw, 12px)", transformStyle: "preserve-3d" }}>
      <AnimatePresence mode="popLayout">
        {slots.map((_, i) => {
          const displayIndex = reversed ? maxSlots - 1 - i : i;
          const card = cards[displayIndex];
          const cardDef = card ? cardLookup[card.definitionId] : undefined;
          const isHighlighted = card && highlightIds?.has(card.cardId);
          const slotKey = card
            ? `${card.cardId}-${card.faceDown ? "fd" : "fu"}`
            : `empty-${displayIndex}`;

          return (
            <BoardSlot
              key={slotKey}
              card={card}
              cardDef={cardDef}
              highlight={isHighlighted}
              onClick={card && onSlotClick ? () => onSlotClick(card.cardId) : undefined}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
