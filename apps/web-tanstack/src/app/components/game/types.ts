export type Phase =
  | "draw"
  | "standby"
  | "main"
  | "combat"
  | "main2"
  | "breakdown_check"
  | "end";

export type BoardCard = {
  cardId: string;
  definitionId: string;
  position?: "attack" | "defense";
  faceDown?: boolean;
  canAttack?: boolean;
  hasAttackedThisTurn?: boolean;
  changedPositionThisTurn?: boolean;
  viceCounters?: number;
  temporaryBoosts?: {
    attack?: number;
    defense?: number;
  };
  equippedCards?: string[];
  turnSummoned?: number;
};
