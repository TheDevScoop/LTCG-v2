import type { Position } from "./state.js";

export type Command =
  | { type: "SUMMON"; cardId: string; position: Position; tributeCardIds?: string[] }
  | { type: "SET_MONSTER"; cardId: string }
  | { type: "FLIP_SUMMON"; cardId: string }
  | { type: "CHANGE_POSITION"; cardId: string }
  | { type: "SET_SPELL_TRAP"; cardId: string }
  | { type: "ACTIVATE_SPELL"; cardId: string; effectIndex?: number; targets?: string[] }
  | { type: "ACTIVATE_TRAP"; cardId: string; effectIndex?: number; targets?: string[] }
  | { type: "ACTIVATE_EFFECT"; cardId: string; effectIndex: number; targets?: string[] }
  | { type: "DECLARE_ATTACK"; attackerId: string; attackerSlot?: number; targetId?: string; targetSlot?: number }
  | { type: "ADVANCE_PHASE" }
  | { type: "END_TURN" }
  | {
      type: "CHAIN_RESPONSE";
      cardId?: string;
      sourceCardId?: string;
      effectIndex?: number;
      chainLink?: number;
      targets?: string[];
      pass: boolean;
    }
  | { type: "SURRENDER" };
