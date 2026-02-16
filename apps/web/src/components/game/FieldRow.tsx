import type { BoardCard } from "@lunchtable-tcg/engine";
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
    <div className="flex gap-1 justify-center">
      {slots.map((_, i) => {
        const cardIndex = reversed ? cards.length - 1 - i : i;
        const card = cards[cardIndex];
        const cardDef = card ? cardLookup[card.cardId] : undefined;
        const isHighlighted = card && highlightIds?.has(card.cardId);

        return (
          <BoardSlot
            key={i}
            card={card}
            cardDef={cardDef}
            highlight={isHighlighted}
            onClick={card && onSlotClick ? () => onSlotClick(card.cardId) : undefined}
          />
        );
      })}
    </div>
  );
}
