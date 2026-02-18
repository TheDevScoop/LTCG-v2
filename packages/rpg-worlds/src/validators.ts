import type { WorldManifest, DiceExpressionAST } from "./types.js";

const DICE_PATTERN = /^(\\d+)d(\\d+)([+-]\\d+)?$/;

export function parseDiceExpressionAST(expression: string): DiceExpressionAST {
  const match = expression.trim().match(DICE_PATTERN);
  if (!match) {
    throw new Error(`Invalid dice expression: ${expression}`);
  }

  return {
    schemaVersion: "1.0.0",
    expression,
    diceCount: Number(match[1]),
    diceSides: Number(match[2]),
    modifier: match[3] ? Number(match[3]) : 0,
  };
}

export function validateWorldManifest(manifest: WorldManifest): string[] {
  const errors: string[] = [];

  if (!manifest.schemaVersion) errors.push("schemaVersion is required");
  if (!manifest.worldId) errors.push("worldId is required");
  if (!manifest.slug) errors.push("slug is required");
  if (!manifest.title) errors.push("title is required");
  if (!manifest.ruleset?.id) errors.push("ruleset.id is required");
  if (!manifest.campaign?.nodes?.length) errors.push("campaign must include nodes");
  if (!manifest.scenes2D?.length) errors.push("at least one 2D scene is required");
  if (!manifest.agentPolicies?.length) errors.push("at least one agent policy is required");

  return errors;
}
