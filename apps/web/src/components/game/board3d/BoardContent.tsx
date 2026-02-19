import { BoardTable } from "./BoardTable";
import { BoardCamera } from "./BoardCamera";
import { BoardLighting } from "./BoardLighting";
import { CenterDivider } from "./CenterDivider";
import { Card3D } from "./Card3D";
import { EmptySlot3D } from "./EmptySlot3D";
import { ActiveFieldGlow } from "./effects/ActiveFieldGlow";
import { ChalkDust } from "./effects/ChalkDust";
import { BoardFrame } from "./effects/BoardFrame";
import type { BoardCard, Phase } from "../types";

// Card slot positions in 3D space
// X spacing: 1.5 units apart, centered around 0
const SLOT_X = [-1.5, 0, 1.5];

// Z positions for each row (negative = far/opponent, positive = near/player)
const OPP_ST_Z = -2.5;
const OPP_MON_Z = -1.2;
const PLR_MON_Z = 1.2;
const PLR_ST_Z = 2.5;

const CARD_Y = 0.01; // Slight lift off board surface

type SpellTrapCard = {
  cardId: string;
  definitionId: string;
  faceDown?: boolean;
  activated?: boolean;
};

export interface BoardContentProps {
  playerBoard: BoardCard[];
  opponentBoard: BoardCard[];
  playerSpellTraps: SpellTrapCard[];
  opponentSpellTraps: SpellTrapCard[];
  cardLookup: Record<string, any>;
  phase?: Phase;
  isMyTurn?: boolean;
  highlightIds?: Set<string>;
  onCardClick?: (cardId: string) => void;
  isChainPromptOpen?: boolean;
  maxBoardSlots?: number;
  maxSpellTrapSlots?: number;
}

export function BoardContent({
  playerBoard,
  opponentBoard,
  playerSpellTraps,
  opponentSpellTraps,
  cardLookup,
  phase,
  isMyTurn = false,
  highlightIds,
  onCardClick,
  isChainPromptOpen = false,
  maxBoardSlots = 3,
  maxSpellTrapSlots = 3,
}: BoardContentProps) {
  const disabled = isChainPromptOpen;

  return (
    <>
      <BoardCamera />
      <BoardLighting phase={phase} />
      <BoardTable />
      <CenterDivider />

      {/* Active field glow when it's player's turn */}
      {isMyTurn && <ActiveFieldGlow />}

      {/* Atmosphere */}
      <ChalkDust />
      <BoardFrame />

      {/* --- Opponent Monster Row --- */}
      {Array.from({ length: maxBoardSlots }).map((_, i) => {
        const card = opponentBoard[i];
        const x = SLOT_X[i] ?? (i - 1) * 1.5;
        if (!card) {
          return (
            <EmptySlot3D
              key={`opp-mon-${i}`}
              position={[x, CARD_Y, OPP_MON_Z]}
            />
          );
        }
        return (
          <Card3D
            key={`opp-mon-${card.cardId}`}
            cardId={card.cardId}
            definitionId={card.definitionId}
            cardDef={cardLookup[card.definitionId]}
            position={[x, CARD_Y, OPP_MON_Z]}
            faceDown={card.faceDown}
            cardPosition={card.position}
            viceCounters={card.viceCounters}
            temporaryBoosts={card.temporaryBoosts}
            interactive={false}
            disabled
          />
        );
      })}

      {/* --- Opponent Spell/Trap Row --- */}
      {Array.from({ length: maxSpellTrapSlots }).map((_, i) => {
        const card = opponentSpellTraps[i];
        const x = SLOT_X[i] ?? (i - 1) * 1.5;
        if (!card) {
          return (
            <EmptySlot3D
              key={`opp-st-${i}`}
              position={[x, CARD_Y, OPP_ST_Z]}
            />
          );
        }
        return (
          <Card3D
            key={`opp-st-${card.cardId}`}
            cardId={card.cardId}
            definitionId={card.definitionId}
            cardDef={cardLookup[card.definitionId]}
            position={[x, CARD_Y, OPP_ST_Z]}
            faceDown={card.faceDown}
            interactive={false}
            disabled
          />
        );
      })}

      {/* --- Player Monster Row --- */}
      {Array.from({ length: maxBoardSlots }).map((_, i) => {
        const card = playerBoard[i];
        const x = SLOT_X[i] ?? (i - 1) * 1.5;
        if (!card) {
          return (
            <EmptySlot3D
              key={`plr-mon-${i}`}
              position={[x, CARD_Y, PLR_MON_Z]}
            />
          );
        }
        return (
          <Card3D
            key={`plr-mon-${card.cardId}`}
            cardId={card.cardId}
            definitionId={card.definitionId}
            cardDef={cardLookup[card.definitionId]}
            position={[x, CARD_Y, PLR_MON_Z]}
            faceDown={card.faceDown}
            cardPosition={card.position}
            highlight={highlightIds?.has(card.cardId)}
            viceCounters={card.viceCounters}
            temporaryBoosts={card.temporaryBoosts}
            onClick={onCardClick}
            interactive
            disabled={disabled}
          />
        );
      })}

      {/* --- Player Spell/Trap Row --- */}
      {Array.from({ length: maxSpellTrapSlots }).map((_, i) => {
        const card = playerSpellTraps[i];
        const x = SLOT_X[i] ?? (i - 1) * 1.5;
        if (!card) {
          return (
            <EmptySlot3D
              key={`plr-st-${i}`}
              position={[x, CARD_Y, PLR_ST_Z]}
            />
          );
        }
        return (
          <Card3D
            key={`plr-st-${card.cardId}`}
            cardId={card.cardId}
            definitionId={card.definitionId}
            cardDef={cardLookup[card.definitionId]}
            position={[x, CARD_Y, PLR_ST_Z]}
            faceDown={card.faceDown}
            interactive={false}
            disabled
          />
        );
      })}
    </>
  );
}
