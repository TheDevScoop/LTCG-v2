import { HandCard } from "./HandCard";

interface PlayerHandProps {
  hand: string[];
  cardLookup: Record<string, any>;
  playableIds?: Set<string>;
  onCardClick?: (cardId: string) => void;
}

export function PlayerHand({
  hand,
  cardLookup,
  playableIds,
  onCardClick,
}: PlayerHandProps) {
  return (
    <div className="flex justify-center items-end py-2 overflow-x-auto hide-scrollbar">
      {hand.map((cardId, i) => (
        <HandCard
          key={cardId}
          cardId={cardId}
          cardDef={cardLookup[cardId]}
          index={i}
          totalCards={hand.length}
          playable={playableIds?.has(cardId)}
          onClick={onCardClick ? () => onCardClick(cardId) : undefined}
        />
      ))}
    </div>
  );
}
