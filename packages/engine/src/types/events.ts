import type { Seat, Phase, Position, WinReason } from "./state.js";

export type EngineEvent =
  | { type: "GAME_STARTED"; hostId: string; awayId: string; goingFirst: Seat }
  | { type: "GAME_ENDED"; winner: Seat; reason: WinReason }
  | { type: "TURN_STARTED"; seat: Seat; turnNumber: number }
  | { type: "TURN_ENDED"; seat: Seat }
  | { type: "PHASE_CHANGED"; from: Phase; to: Phase }
  | { type: "CARD_DRAWN"; seat: Seat; cardId: string }
  | { type: "DECK_OUT"; seat: Seat }
  | { type: "MONSTER_SUMMONED"; seat: Seat; cardId: string; position: Position; tributes: string[] }
  | { type: "MONSTER_SET"; seat: Seat; cardId: string }
  | { type: "FLIP_SUMMONED"; seat: Seat; cardId: string; position: Position }
  | { type: "SPECIAL_SUMMONED"; seat: Seat; cardId: string; from: string; position: Position }
  | { type: "SPELL_TRAP_SET"; seat: Seat; cardId: string }
  | { type: "SPELL_ACTIVATED"; seat: Seat; cardId: string; targets: string[] }
  | { type: "TRAP_ACTIVATED"; seat: Seat; cardId: string; targets: string[] }
  | { type: "EFFECT_ACTIVATED"; seat: Seat; cardId: string; effectIndex: number; targets: string[] }
  | {
      type: "ATTACK_DECLARED";
      seat: Seat;
      attackerId: string;
      attackerSlot?: number;
      targetId: string | null;
    }
  | { type: "DAMAGE_DEALT"; seat: Seat; amount: number; isBattle: boolean }
  | { type: "BATTLE_RESOLVED"; attackerId: string; defenderId: string | null; result: "win" | "lose" | "draw" }
  | { type: "CARD_DESTROYED"; cardId: string; reason: "battle" | "effect" | "breakdown" }
  | { type: "CARD_BANISHED"; cardId: string; from: string; sourceSeat?: Seat }
  | { type: "CARD_RETURNED_TO_HAND"; cardId: string; from: string; sourceSeat?: Seat }
  | { type: "CARD_SENT_TO_GRAVEYARD"; cardId: string; from: string; sourceSeat?: Seat }
  | { type: "VICE_COUNTER_ADDED"; cardId: string; newCount: number }
  | { type: "VICE_COUNTER_REMOVED"; cardId: string; newCount: number }
  | { type: "BREAKDOWN_TRIGGERED"; seat: Seat; cardId: string }
  | { type: "POSITION_CHANGED"; cardId: string; from: Position; to: Position }
  | {
      type: "MODIFIER_APPLIED";
      cardId: string;
      field: "attack" | "defense";
      amount: number;
      source: string;
      expiresAt: "end_of_turn" | "end_of_next_turn" | "permanent";
    }
  | { type: "MODIFIER_EXPIRED"; cardId: string; source: string }
  | { type: "CHAIN_STARTED" }
  | { type: "CHAIN_LINK_ADDED"; cardId: string; seat: Seat; effectIndex: number; targets?: string[] }
  | { type: "CHAIN_RESOLVED" }
  | { type: "CHAIN_PASSED"; seat: Seat }
  | { type: "PONG_OPPORTUNITY"; seat: Seat; destroyedCardId: string }
  | { type: "PONG_ATTEMPTED"; seat: Seat; destroyedCardId: string; result: "sink" | "miss" }
  | { type: "PONG_DECLINED"; seat: Seat; destroyedCardId: string }
  | { type: "REDEMPTION_OPPORTUNITY"; seat: Seat }
  | { type: "REDEMPTION_ATTEMPTED"; seat: Seat; result: "sink" | "miss" }
  | { type: "REDEMPTION_GRANTED"; newLP: number };
