export type CardType = "stereotype" | "spell" | "trap";
export type Attribute = "fire" | "water" | "earth" | "wind" | "dark" | "light" | "neutral";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type SpellType = "normal" | "continuous" | "equip" | "field" | "quick-play" | "ritual";
export type TrapType = "normal" | "continuous" | "counter";

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  description: string;
  rarity: Rarity;
  attack?: number;
  defense?: number;
  level?: number;
  attribute?: Attribute;
  archetype?: string;
  spellType?: SpellType;
  trapType?: TrapType;
  effects?: EffectDefinition[];
  // Game metadata — not used by rules engine, carried for display/storage
  viceType?: string;
  flavorText?: string;
  imageUrl?: string;
  cost?: number;
  meta?: Record<string, unknown>;
}

export interface EffectDefinition {
  id: string;
  type: "ignition" | "trigger" | "quick" | "continuous" | "flip" | "on_summon";
  description: string;
  cost?: CostDefinition;
  targetCount?: number;
  targetFilter?: TargetFilter;
  actions: EffectAction[];
  oncePerTurn?: boolean;
  hardOncePerTurn?: boolean;
}

export interface CostDefinition {
  type: "tribute" | "discard" | "pay_lp" | "remove_vice" | "banish";
  count?: number;
  amount?: number;
}

export interface TargetFilter {
  zone?: "board" | "hand" | "graveyard" | "banished" | "deck";
  owner?: "self" | "opponent" | "any";
  cardType?: CardType;
  attribute?: Attribute;
}

export type EffectAction =
  | { type: "destroy"; target: "selected" | "all_opponent_monsters" | "all_spells_traps" }
  | { type: "damage"; amount: number; target: "opponent" }
  | { type: "heal"; amount: number; target: "self" }
  | { type: "draw"; count: number }
  | { type: "discard"; count: number; target: "opponent" }
  | { type: "boost_attack"; amount: number; duration: "turn" | "permanent" }
  | { type: "boost_defense"; amount: number; duration: "turn" | "permanent" }
  | { type: "add_vice"; count: number; target: "selected" }
  | { type: "remove_vice"; count: number; target: "selected" }
  | { type: "special_summon"; from: "hand" | "graveyard" | "deck" | "banished" }
  | { type: "banish"; target: "selected" }
  | { type: "return_to_hand"; target: "selected" }
  | { type: "negate"; target: "last_chain_link" }
  | { type: "change_position"; target: "selected" }
  | {
      type: "modify_cost";
      cardType: "spell" | "trap" | "all";
      operation: "set" | "add" | "multiply";
      amount: number;
      target: "self" | "opponent" | "both";
      durationTurns: number;
    }
  | { type: "view_top_cards"; count: number }
  | { type: "rearrange_top_cards"; count: number; strategy: "reverse" | "keep" }
  | {
      type: "apply_restriction";
      restriction: "disable_attacks" | "disable_battle_phase" | "disable_draw_phase" | "disable_effects";
      target: "self" | "opponent" | "both";
      durationTurns: number;
    };
