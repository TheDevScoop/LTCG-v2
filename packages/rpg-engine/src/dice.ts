import type { DiceRollResult } from "./types.js";

const DICE_PATTERN = /^(\\d+)d(\\d+)([+-]\\d+)?$/;

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: number) {
  let current = seed >>> 0;
  return () => {
    current = (current + 0x6d2b79f5) | 0;
    let t = Math.imul(current ^ (current >>> 15), 1 | current);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollDice(expression: string, seedHint?: string | number): DiceRollResult {
  const normalized = expression.trim().toLowerCase();
  const match = normalized.match(DICE_PATTERN);
  if (!match) {
    throw new Error(`Invalid dice expression: ${expression}`);
  }

  const diceCount = Number(match[1]);
  const diceSides = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;
  if (diceCount <= 0 || diceCount > 100) throw new Error("diceCount out of range");
  if (diceSides <= 1 || diceSides > 1000) throw new Error("diceSides out of range");

  const seed = hashSeed(`${seedHint ?? "default"}:${normalized}`);
  const rng = createRng(seed);
  const dice = Array.from({ length: diceCount }, () => Math.floor(rng() * diceSides) + 1);
  const total = dice.reduce((sum, value) => sum + value, 0) + modifier;

  return { expression: normalized, dice, modifier, total };
}
