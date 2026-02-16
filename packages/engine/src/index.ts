// @lunchtable-tcg/engine
// Pure TypeScript trading card game engine — zero dependencies
export * from "./types/index.js";
export { defineCards, validateDeck } from "./cards.js";
export type { CardLookup, DeckValidation, DeckOptions } from "./cards.js";
export { createEngine, createInitialState, decide, evolve, mask, legalMoves } from "./engine.js";
export type { Engine, EngineOptions } from "./engine.js";
export { loadCardsFromArray, loadCardsFromJSON } from "./loader.js";
export { defineCardSet, mergeCardSets } from "./cardSet.js";
export type { CardSet, CardSetInput } from "./cardSet.js";
export { toConvexCardRows, fromConvexCardRow, buildCardLookup } from "./seeder.js";
export type { ConvexCardRow } from "./seeder.js";
export { parseCSVAbilities, parseCSVAbility } from "./effectParser.js";
export type { CSVAbility } from "./effectParser.js";
export { executeAction, findBoardCard } from "./effects/operations.js";
export { executeEffect, findAbilityByTrigger } from "./effects/interpreter.js";
export { decideChainResponse } from "./rules/chain.js";
export { resolveEffectActions, canActivateEffect, detectTriggerEffects } from "./rules/effects.js";
