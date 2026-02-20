export interface EngineConfig {
  startingLP: number;
  deckSize: { min: number; max: number };
  maxHandSize: number;
  maxBoardSlots: number;
  maxSpellTrapSlots: number;
  startingHandSize: number;
  breakdownThreshold: number;
  maxBreakdownsToWin: number;
  pongEnabled: boolean;
  redemptionEnabled: boolean;
  redemptionLP: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  startingLP: 8000,
  deckSize: { min: 40, max: 60 },
  maxHandSize: 7,
  maxBoardSlots: 3,
  maxSpellTrapSlots: 3,
  startingHandSize: 5,
  breakdownThreshold: 3,
  maxBreakdownsToWin: 3,
  pongEnabled: false,
  redemptionEnabled: false,
  redemptionLP: 5000,
};
